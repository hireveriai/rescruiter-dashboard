import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { errorResponse } from "@/lib/server/response"
import { matchCandidateToJobWithAI } from "@/lib/server/ai-screening/openai"
import {
  getCandidatesForMatching,
  getMatchResults,
  getRecentCandidatesForMatchingFallback,
  getScreeningJob,
  getUploadBatchManifest,
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
    const batchId = String(url.searchParams.get("batchId") ?? url.searchParams.get("batch_id") ?? "").trim()
    const candidateIds = String(url.searchParams.get("candidateIds") ?? url.searchParams.get("candidate_ids") ?? "")
      .split(",")
      .map((candidateId) => candidateId.trim())
      .filter(Boolean)
    const includeAllCandidates =
      url.searchParams.get("includeAllCandidates") === "true" ||
      url.searchParams.get("include_all_candidates") === "true"

    if (!jobId) {
      throw new ApiError(400, "JOB_NOT_SELECTED", "Job not selected")
    }

    if (!includeAllCandidates && !batchId && candidateIds.length === 0) {
      throw new ApiError(400, "NO_RESUMES_UPLOADED", "No resumes uploaded")
    }

    const job = await getScreeningJob(auth.organizationId, jobId)

    if (!job) {
      throw new ApiError(400, "JD_NOT_PROCESSED", "Process JD first")
    }

    const manifestCandidateIds =
      !includeAllCandidates && batchId && candidateIds.length === 0
        ? (await getUploadBatchManifest({
            batchId,
            organizationId: auth.organizationId,
          }))?.candidateIds ?? []
        : []
    const scopedCandidateIds = candidateIds.length > 0 ? candidateIds : manifestCandidateIds

    const matches = await getMatchResults(auth.organizationId, jobId, {
      uploadBatchId: batchId || null,
      candidateIds: scopedCandidateIds,
      includeAllCandidates,
    })

    return NextResponse.json({
      success: true,
      data: {
        job,
        source: includeAllCandidates ? "full_db" : "batch",
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
      batchId?: string
      batch_id?: string
      includeAllCandidates?: boolean
      include_all_candidates?: boolean
    }
    const jobId = String(body.job_id ?? body.jobId ?? "").trim()
    const batchId = String(body.batchId ?? body.batch_id ?? "").trim()
    const includeAllCandidates = body.includeAllCandidates === true || body.include_all_candidates === true
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds
      : Array.isArray(body.candidate_ids)
        ? body.candidate_ids
        : undefined

    if (!jobId) {
      throw new ApiError(400, "JOB_NOT_SELECTED", "Job not selected")
    }

    const job = await getScreeningJob(auth.organizationId, jobId)

    if (!job) {
      throw new ApiError(400, "JD_NOT_PROCESSED", "Process JD first")
    }

    const manifestCandidateIds =
      !includeAllCandidates && batchId && !candidateIds?.length
        ? (await getUploadBatchManifest({
            batchId,
            organizationId: auth.organizationId,
          }))?.candidateIds ?? []
        : []
    const scopedCandidateIds = candidateIds?.length ? candidateIds : manifestCandidateIds

    if (!includeAllCandidates && !batchId && !candidateIds?.length) {
      throw new ApiError(400, "NO_RESUMES_UPLOADED", "No resumes uploaded")
    }

    const source = includeAllCandidates ? "full_db" : "batch"
    let candidates = await getCandidatesForMatching({
      organizationId: auth.organizationId,
      candidateIds: scopedCandidateIds,
      uploadBatchId: batchId || null,
      includeAllCandidates,
    })

    if (candidates.length === 0 && !includeAllCandidates) {
      candidates = await getRecentCandidatesForMatchingFallback({
        organizationId: auth.organizationId,
        userId: auth.userId,
      })
    }

    if (candidates.length === 0) {
      console.warn("AI screening matching found no candidates", {
        organizationId: auth.organizationId,
        jobId,
        batchId: batchId || null,
        candidateIdsCount: scopedCandidateIds.length,
        includeAllCandidates,
      })
      throw new ApiError(
        400,
        "NO_CANDIDATES_FOR_UPLOAD",
        "Uploaded resumes were saved, but no candidates were found for matching. Re-upload once or enable Full DB mode."
      )
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

    const matches = await getMatchResults(auth.organizationId, jobId, {
      uploadBatchId: batchId || null,
      candidateIds: scopedCandidateIds,
      includeAllCandidates,
    })

    return NextResponse.json({
      success: true,
      data: {
        job,
        matchedCount: candidates.length,
        source,
        matches,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
