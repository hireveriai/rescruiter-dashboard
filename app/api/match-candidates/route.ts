import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { errorResponse } from "@/lib/server/response"
import { matchCandidateToJobWithAI } from "@/lib/server/ai-screening/openai"
import {
  getCandidatesForMatching,
  getMatchResults,
  getScreeningJob,
  upsertCandidateJobMatch,
} from "@/lib/server/ai-screening/service"

export const runtime = "nodejs"

const BATCH_SIZE = 3

async function processInBatches<T, R>(items: T[], batchSize: number, worker: (item: T) => Promise<R>) {
  const results: R[] = []

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize)
    const batchResults = await Promise.all(batch.map(worker))
    results.push(...batchResults)
  }

  return results
}

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const url = new URL(request.url)
    const jobId = String(url.searchParams.get("job_id") ?? url.searchParams.get("jobId") ?? "").trim()

    if (!jobId) {
      throw new ApiError(400, "JOB_ID_REQUIRED", "job_id is required")
    }

    const job = await getScreeningJob(auth.organizationId, jobId)

    if (!job) {
      throw new ApiError(404, "JOB_NOT_FOUND", "Screening job was not found")
    }

    const matches = await getMatchResults(auth.organizationId, jobId)

    return NextResponse.json({
      success: true,
      data: {
        job,
        matches,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const body = (await request.json()) as {
      job_id?: string
      jobId?: string
      candidateIds?: string[]
      candidate_ids?: string[]
    }
    const jobId = String(body.job_id ?? body.jobId ?? "").trim()
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds
      : Array.isArray(body.candidate_ids)
        ? body.candidate_ids
        : undefined

    if (!jobId) {
      throw new ApiError(400, "JOB_ID_REQUIRED", "job_id is required")
    }

    const job = await getScreeningJob(auth.organizationId, jobId)

    if (!job) {
      throw new ApiError(404, "JOB_NOT_FOUND", "Screening job was not found")
    }

    const candidates = await getCandidatesForMatching(auth.organizationId, candidateIds)

    if (candidates.length === 0) {
      throw new ApiError(400, "NO_CANDIDATES", "Upload candidates before running matching")
    }

    await processInBatches(candidates, BATCH_SIZE, async (candidate) => {
      const result = await matchCandidateToJobWithAI({
        candidateJson: candidate.extracted_json ?? {},
        resumeText: candidate.resume_text,
        job: {
          title: job.title,
          description: job.description,
          roleTitle: job.roleTitle,
          requiredSkills: job.requiredSkills,
          experienceNeeded: job.experienceNeeded,
          seniority:
            job.extractedJson &&
            typeof job.extractedJson === "object" &&
            "seniority" in job.extractedJson &&
            (job.extractedJson.seniority === "JUNIOR" ||
              job.extractedJson.seniority === "MID" ||
              job.extractedJson.seniority === "SENIOR")
              ? job.extractedJson.seniority
              : null,
          summary:
            job.extractedJson &&
            typeof job.extractedJson === "object" &&
            "summary" in job.extractedJson &&
            typeof job.extractedJson.summary === "string"
              ? job.extractedJson.summary
              : job.description.slice(0, 700),
        },
      })

      await upsertCandidateJobMatch({
        organizationId: auth.organizationId,
        candidateId: candidate.candidate_id,
        jobId,
        result,
      })
    })

    const matches = await getMatchResults(auth.organizationId, jobId)

    return NextResponse.json({
      success: true,
      data: {
        job,
        matchedCount: matches.length,
        matches,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
