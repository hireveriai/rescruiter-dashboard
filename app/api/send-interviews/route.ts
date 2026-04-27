import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { errorResponse } from "@/lib/server/response"
import { createInterviewLink } from "@/lib/server/services/interview.service"
import { sendAiScreeningInterviewEmail } from "@/lib/server/ai-screening/email"
import {
  getMatchesForInviteSelection,
  getScreeningJob,
  normalizeEmail,
  recordInterviewInviteForScreening,
} from "@/lib/server/ai-screening/service"

export const runtime = "nodejs"

const BATCH_SIZE = 4

async function processInBatches<T, R>(items: T[], batchSize: number, worker: (item: T) => Promise<R>) {
  const results: R[] = []

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize)
    const batchResults = await Promise.all(batch.map(worker))
    results.push(...batchResults)
  }

  return results
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return "Unknown error"
}

export async function POST(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const body = (await request.json()) as {
      job_id?: string
      jobId?: string
      mode?: "STRONG_FIT" | "TOP_N" | "SELECTED"
      selection?: "STRONG_FIT" | "TOP_N" | "SELECTED"
      topN?: number
      top_n?: number
      candidateIds?: string[]
      candidate_ids?: string[]
    }
    const screeningJobId = String(body.job_id ?? body.jobId ?? "").trim()
    const mode = body.mode ?? body.selection ?? "STRONG_FIT"
    const topN = Number(body.topN ?? body.top_n ?? 10)
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds
      : Array.isArray(body.candidate_ids)
        ? body.candidate_ids
        : undefined

    if (!screeningJobId) {
      throw new ApiError(400, "JOB_ID_REQUIRED", "job_id is required")
    }

    if (mode !== "STRONG_FIT" && mode !== "TOP_N" && mode !== "SELECTED") {
      throw new ApiError(400, "INVALID_SELECTION_MODE", "Invalid interview selection mode")
    }

    const job = await getScreeningJob(auth.organizationId, screeningJobId)

    if (!job) {
      throw new ApiError(404, "JOB_NOT_FOUND", "Screening job was not found")
    }

    const interviewJobId = job.sourceJobPositionId || job.id
    const selected = await getMatchesForInviteSelection({
      organizationId: auth.organizationId,
      jobId: screeningJobId,
      mode,
      topN: Number.isFinite(topN) ? topN : 10,
      candidateIds,
    })

    if (selected.length === 0) {
      throw new ApiError(400, "NO_MATCHES_SELECTED", "No matched candidates were selected")
    }

    const results = await processInBatches(selected, BATCH_SIZE, async (match) => {
      const email = normalizeEmail(match.email)

      if (!email) {
        return {
          candidateId: match.candidate_id,
          candidateName: match.candidate_name,
          email: match.email,
          status: "SKIPPED",
          error: "Candidate email is missing or invalid",
          inviteLink: null,
        }
      }

      try {
        const link = await createInterviewLink({
          organizationId: auth.organizationId,
          jobId: interviewJobId,
          candidateId: match.candidate_id,
          accessType: "FLEXIBLE",
        })

        try {
          await sendAiScreeningInterviewEmail({
            to: email,
            name: match.candidate_name,
            link: link.link,
          })

          await recordInterviewInviteForScreening({
            interviewId: link.interviewId,
            candidateId: match.candidate_id,
            screeningJobId,
            email,
            inviteLink: link.link,
            matchId: match.match_id,
            emailStatus: "SENT",
          })

          return {
            candidateId: match.candidate_id,
            candidateName: match.candidate_name,
            email,
            status: "SENT",
            error: null,
            inviteLink: link.link,
          }
        } catch (emailError) {
          await recordInterviewInviteForScreening({
            interviewId: link.interviewId,
            candidateId: match.candidate_id,
            screeningJobId,
            email,
            inviteLink: link.link,
            matchId: match.match_id,
            emailStatus: "FAILED",
          })

          return {
            candidateId: match.candidate_id,
            candidateName: match.candidate_name,
            email,
            status: "FAILED",
            error: getErrorMessage(emailError),
            inviteLink: link.link,
          }
        }
      } catch (error) {
        return {
          candidateId: match.candidate_id,
          candidateName: match.candidate_name,
          email,
          status: "FAILED",
          error: getErrorMessage(error),
          inviteLink: null,
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        requestedCount: selected.length,
        sentCount: results.filter((result) => result.status === "SENT").length,
        skippedCount: results.filter((result) => result.status === "SKIPPED").length,
        failedCount: results.filter((result) => result.status === "FAILED").length,
        results,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
