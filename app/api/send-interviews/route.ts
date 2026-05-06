import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { errorResponse } from "@/lib/server/response"
import {
  createInterviewLink,
  getLatestInterviewInviteForEmail,
  recordInterviewInviteTracking,
} from "@/lib/server/services/interview.service"
import { sendAiScreeningInterviewEmail } from "@/lib/server/ai-screening/email"
import {
  getMatchesForInviteSelection,
  getScreeningJob,
  normalizeEmail,
  recordInterviewInviteForScreening,
} from "@/lib/server/ai-screening/service"

export const runtime = "nodejs"

const BATCH_SIZE = 4
type MatchScope = "BATCH" | "GLOBAL"
type InterviewAccessType = "FLEXIBLE" | "SCHEDULED"
type CandidateInterviewSchedule = {
  candidateId: string
  accessType: InterviewAccessType
  startTime: string | null
  endTime: string | null
}

function resolveMatchScope(value: unknown, includeAllCandidates: boolean): MatchScope {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : ""

  if (normalized === "GLOBAL") {
    return "GLOBAL"
  }

  if (normalized === "BATCH") {
    return "BATCH"
  }

  return includeAllCandidates ? "GLOBAL" : "BATCH"
}

function resolveAccessType(value: unknown): InterviewAccessType {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : ""

  if (normalized === "SCHEDULED") {
    return "SCHEDULED"
  }

  return "FLEXIBLE"
}

function normalizeScheduleTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return date.toISOString()
}

function parseCandidateSchedules(value: unknown): CandidateInterviewSchedule[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {}
    const candidateId = String(record.candidateId ?? record.candidate_id ?? "").trim()
    const accessType = resolveAccessType(record.accessType ?? record.access_type)
    const startTime = normalizeScheduleTime(record.startTime ?? record.start_time)
    const endTime = normalizeScheduleTime(record.endTime ?? record.end_time)

    if (!candidateId) {
      throw new ApiError(400, "INVALID_CANDIDATE_SCHEDULE", "Candidate schedule is missing a candidate.")
    }

    if (accessType === "SCHEDULED") {
      if (!startTime || !endTime) {
        throw new ApiError(400, "INVALID_CANDIDATE_SCHEDULE", "Start time and end time are required for scheduled interviews.")
      }

      if (new Date(endTime) <= new Date(startTime)) {
        throw new ApiError(400, "INVALID_CANDIDATE_SCHEDULE", "End time must be after start time for every scheduled candidate.")
      }
    }

    return {
      candidateId,
      accessType,
      startTime: accessType === "SCHEDULED" ? startTime : null,
      endTime: accessType === "SCHEDULED" ? endTime : null,
    }
  })
}

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
      candidates?: Array<{
        candidateId?: string
        candidate_id?: string
        accessType?: string
        access_type?: string
        startTime?: string | null
        start_time?: string | null
        endTime?: string | null
        end_time?: string | null
      }>
      batchId?: string
      batch_id?: string
      matchScope?: string
      match_scope?: string
      includeAllCandidates?: boolean
      include_all_candidates?: boolean
      confirmDuplicateInvites?: boolean
      confirm_duplicate_invites?: boolean
    }
    const screeningJobId = String(body.job_id ?? body.jobId ?? "").trim()
    const mode = body.mode ?? body.selection ?? "STRONG_FIT"
    const topN = Number(body.topN ?? body.top_n ?? 10)
    const batchId = String(body.batchId ?? body.batch_id ?? "").trim()
    const legacyIncludeAllCandidates = body.includeAllCandidates === true || body.include_all_candidates === true
    const matchScope = resolveMatchScope(body.matchScope ?? body.match_scope, legacyIncludeAllCandidates)
    const includeAllCandidates = matchScope === "GLOBAL"
    const confirmDuplicateInvites = body.confirmDuplicateInvites === true || body.confirm_duplicate_invites === true
    const candidateSchedules = parseCandidateSchedules(body.candidates)
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds
      : Array.isArray(body.candidate_ids)
        ? body.candidate_ids
        : candidateSchedules.length > 0
          ? candidateSchedules.map((schedule) => schedule.candidateId)
          : undefined
    const scheduleByCandidateId = new Map(candidateSchedules.map((schedule) => [schedule.candidateId, schedule]))

    if (!screeningJobId) {
      throw new ApiError(400, "JOB_NOT_SELECTED", "Job not selected")
    }

    if (mode !== "STRONG_FIT" && mode !== "TOP_N" && mode !== "SELECTED") {
      throw new ApiError(400, "INVALID_SELECTION_MODE", "Invalid interview selection mode")
    }

    if (!includeAllCandidates && !batchId && mode !== "SELECTED") {
      throw new ApiError(400, "UPLOAD_BATCH_REQUIRED", "Current upload is required. Use Search All Candidates to send from the full database.")
    }

    const job = await getScreeningJob(auth.organizationId, screeningJobId)

    if (!job) {
      throw new ApiError(400, "JD_NOT_PROCESSED", "Process JD first")
    }

    const interviewJobId = job.sourceJobPositionId || job.id
    const selected = await getMatchesForInviteSelection({
      organizationId: auth.organizationId,
      jobId: screeningJobId,
      mode,
      topN: Number.isFinite(topN) ? topN : 10,
      candidateIds,
      uploadBatchId: batchId || null,
      includeAllCandidates,
    })

    if (selected.length === 0) {
      throw new ApiError(400, "NO_MATCHES_SELECTED", "No matched candidates were selected")
    }

    if (!confirmDuplicateInvites) {
      const duplicateWarnings = (
        await Promise.all(
          selected.map(async (match) => {
            const email = normalizeEmail(match.email)

            if (!email) {
              return null
            }

            const latest = await getLatestInterviewInviteForEmail({
              companyId: auth.organizationId,
              candidateEmail: email,
            })

            return latest
              ? {
                  candidateId: match.candidate_id,
                  candidateName: match.candidate_name,
                  email,
                  lastSentAt: latest.lastSentAt,
                  jobId: latest.jobId,
                }
              : null
          })
        )
      ).filter((warning): warning is NonNullable<typeof warning> => Boolean(warning))

      if (duplicateWarnings.length > 0) {
        return NextResponse.json(
          {
            success: false,
            warning: true,
            duplicates: duplicateWarnings,
            lastSentAt: duplicateWarnings[0]?.lastSentAt ?? null,
            message: "Duplicate interview invite detected for this company",
          },
          { status: 409 }
        )
      }
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
          accessType: scheduleByCandidateId.get(match.candidate_id)?.accessType ?? "FLEXIBLE",
          startTime: scheduleByCandidateId.get(match.candidate_id)?.startTime ?? undefined,
          endTime: scheduleByCandidateId.get(match.candidate_id)?.endTime ?? undefined,
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
          await recordInterviewInviteTracking({
            interviewId: link.interviewId,
            companyId: auth.organizationId,
            jobId: interviewJobId,
            candidateEmail: email,
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
          await recordInterviewInviteTracking({
            interviewId: link.interviewId,
            companyId: auth.organizationId,
            jobId: interviewJobId,
            candidateEmail: email,
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
        matchScope,
        results,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
