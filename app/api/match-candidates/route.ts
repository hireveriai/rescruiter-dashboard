import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { errorResponse } from "@/lib/server/response"
import { matchCandidateToJobWithAI } from "@/lib/server/ai-screening/openai"
import {
  attachCandidatesToUploadBatch,
  createScreeningRun,
  getCandidatesForMatching,
  getCandidatesForMatchingByUploadFiles,
  getMatchResults,
  getScreeningJob,
  getUploadBatchManifest,
  upsertCandidateJobMatch,
} from "@/lib/server/ai-screening/service"

export const runtime = "nodejs"

const BATCH_SIZE = 3
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type MatchScope = "BATCH" | "GLOBAL"

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
    const uploadFileNames = String(url.searchParams.get("uploadFileNames") ?? url.searchParams.get("upload_file_names") ?? "")
      .split(",")
      .map((fileName) => fileName.trim())
      .filter(Boolean)
    const legacyIncludeAllCandidates =
      url.searchParams.get("includeAllCandidates") === "true" ||
      url.searchParams.get("include_all_candidates") === "true"
    const matchScope = resolveMatchScope(
      url.searchParams.get("matchScope") ?? url.searchParams.get("match_scope"),
      legacyIncludeAllCandidates
    )
    const includeAllCandidates = matchScope === "GLOBAL"

    if (!jobId) {
      throw new ApiError(400, "JOB_NOT_SELECTED", "Job not selected")
    }

    const job = await getScreeningJob(auth.organizationId, jobId)

    if (!job) {
      throw new ApiError(400, "JD_NOT_PROCESSED", "Process JD first")
    }

    if (batchId && !UUID_REGEX.test(batchId)) {
      throw new ApiError(400, "INVALID_UPLOAD_BATCH", "Current upload is invalid. Please upload resumes again.")
    }

    if (!includeAllCandidates && !batchId && candidateIds.length === 0) {
      throw new ApiError(400, "UPLOAD_BATCH_REQUIRED", "Current upload is required. Upload resumes before matching.")
    }

    const manifestCandidateIds =
      !includeAllCandidates && batchId && candidateIds.length === 0
        ? (await getUploadBatchManifest({
            batchId,
            organizationId: auth.organizationId,
          }))?.candidateIds ?? []
        : []
    const scopedCandidateIds = candidateIds.length > 0 ? candidateIds : manifestCandidateIds

    let matches = await getMatchResults(auth.organizationId, jobId, {
      uploadBatchId: batchId || null,
      candidateIds: scopedCandidateIds,
      fileNames: uploadFileNames,
      includeAllCandidates,
    })

    if (matches.length === 0 && !includeAllCandidates && batchId && scopedCandidateIds.length > 0) {
      matches = await getMatchResults(auth.organizationId, jobId, {
        uploadBatchId: batchId,
        fileNames: uploadFileNames,
        includeAllCandidates: false,
      })
    }

    if (matches.length === 0 && !includeAllCandidates && uploadFileNames.length > 0) {
      matches = await getMatchResults(auth.organizationId, jobId, {
        fileNames: uploadFileNames,
        includeAllCandidates: false,
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        job,
        matchScope,
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
      uploadFileNames?: string[]
      upload_file_names?: string[]
      matchScope?: string
      match_scope?: string
      includeAllCandidates?: boolean
      include_all_candidates?: boolean
    }
    const jobId = String(body.job_id ?? body.jobId ?? "").trim()
    const batchId = String(body.batchId ?? body.batch_id ?? "").trim()
    const legacyIncludeAllCandidates = body.includeAllCandidates === true || body.include_all_candidates === true
    const matchScope = resolveMatchScope(body.matchScope ?? body.match_scope, legacyIncludeAllCandidates)
    const includeAllCandidates = matchScope === "GLOBAL"
    const candidateIds = Array.isArray(body.candidateIds)
      ? body.candidateIds
      : Array.isArray(body.candidate_ids)
        ? body.candidate_ids
        : undefined
    const uploadFileNames = Array.isArray(body.uploadFileNames)
      ? body.uploadFileNames
      : Array.isArray(body.upload_file_names)
        ? body.upload_file_names
        : []

    if (!jobId) {
      throw new ApiError(400, "JOB_NOT_SELECTED", "Job not selected")
    }

    const job = await getScreeningJob(auth.organizationId, jobId)

    if (!job) {
      throw new ApiError(400, "JD_NOT_PROCESSED", "Process JD first")
    }

    if (batchId && !UUID_REGEX.test(batchId)) {
      throw new ApiError(400, "INVALID_UPLOAD_BATCH", "Current upload is invalid. Please upload resumes again.")
    }

    if (!includeAllCandidates && !batchId && !candidateIds?.length) {
      throw new ApiError(400, "UPLOAD_BATCH_REQUIRED", "Current upload is required. Upload resumes before matching.")
    }

    const manifestCandidateIds =
      !includeAllCandidates && batchId && !candidateIds?.length
        ? (await getUploadBatchManifest({
            batchId,
            organizationId: auth.organizationId,
          }))?.candidateIds ?? []
        : []
    const scopedCandidateIds = candidateIds?.length ? candidateIds : manifestCandidateIds

    const source = includeAllCandidates ? "full_db" : "batch"
    let usedBatchFallback = false
    let candidates = await getCandidatesForMatching({
      organizationId: auth.organizationId,
      candidateIds: scopedCandidateIds,
      uploadBatchId: batchId || null,
      includeAllCandidates,
    })

    if (candidates.length === 0 && !includeAllCandidates && batchId && scopedCandidateIds.length > 0) {
      candidates = await getCandidatesForMatching({
        organizationId: auth.organizationId,
        uploadBatchId: batchId,
        includeAllCandidates: false,
      })
      usedBatchFallback = candidates.length > 0
    }

    if (candidates.length === 0 && !includeAllCandidates && uploadFileNames.length > 0) {
      candidates = await getCandidatesForMatchingByUploadFiles({
        organizationId: auth.organizationId,
        userId: auth.userId,
        uploadBatchId: batchId || null,
        fileNames: uploadFileNames,
      })
      usedBatchFallback = candidates.length > 0

      if (candidates.length > 0 && batchId) {
        await attachCandidatesToUploadBatch({
          organizationId: auth.organizationId,
          uploadBatchId: batchId,
          candidateIds: candidates.map((candidate) => candidate.candidate_id),
        })
      }
    }

    const resolvedCandidateIds = scopedCandidateIds.length > 0 && !usedBatchFallback
      ? scopedCandidateIds
      : candidates.map((candidate) => candidate.candidate_id)

    if (candidates.length === 0) {
      console.warn("VERIS screening matching found no candidates", {
        organizationId: auth.organizationId,
        jobId,
        batchId: batchId || null,
        candidateIdsCount: scopedCandidateIds.length,
        uploadFileNamesCount: uploadFileNames.length,
        includeAllCandidates,
      })
      throw new ApiError(
        400,
        "NO_CANDIDATES_FOR_UPLOAD",
        "Uploaded resumes were saved, but matching could not find the current upload. Please refresh and run matching again, or use Scope: All Candidates (Database)."
      )
    }

    const generatedMatches = await processInBatches(candidates, BATCH_SIZE, async (candidate) => {
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

      return {
        id: `generated-${candidate.candidate_id}`,
        candidateId: candidate.candidate_id,
        candidateName: candidate.full_name,
        email: candidate.email,
        phone: candidate.phone,
        resumeUrl: candidate.resume_url,
        matchScore: result.matchScore,
        skillMatch: result.skillMatch,
        experienceMatch: result.experienceMatch,
        riskLevel: result.riskLevel,
        recommendation: result.recommendation,
        insights: {
          missing_skills: result.missingSkills,
          short_reasoning: result.shortReasoning,
          evaluated_at: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      }
    })

    let matches = await getMatchResults(auth.organizationId, jobId, {
      uploadBatchId: batchId || null,
      candidateIds: resolvedCandidateIds,
      fileNames: uploadFileNames,
      includeAllCandidates,
    })

    if (matches.length === 0 && !includeAllCandidates && uploadFileNames.length > 0) {
      matches = await getMatchResults(auth.organizationId, jobId, {
        fileNames: uploadFileNames,
        includeAllCandidates: false,
      })
    }

    if (matches.length === 0) {
      matches = generatedMatches
    }
    const runId = await createScreeningRun({
      organizationId: auth.organizationId,
      userId: auth.userId,
      jobId,
      batchId: batchId || null,
      matches,
    })

    return NextResponse.json({
      success: true,
      data: {
        job,
        runId,
        matchedCount: candidates.length,
        matchScope,
        source,
        matches,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
