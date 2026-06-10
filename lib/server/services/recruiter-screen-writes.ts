import type { z } from "zod"

import { Prisma } from "@prisma/client"

import { toFunctionApiError } from "@/lib/server/function-errors"
import { prisma } from "@/lib/server/prisma"
import { createJob, setJobActiveState, updateJob } from "@/lib/server/services/jobs"
import { upsertRecruiterDecision, type RecruiterDecisionStatus } from "@/lib/server/services/recruiter-decisions"
import { createJobSchema, updateJobSchema } from "@/lib/server/validators"

type CreateJobInput = z.infer<typeof createJobSchema> & {
  organization_id: string
}

type UpdateJobInput = z.infer<typeof updateJobSchema> & {
  job_id: string
  organization_id: string
}

type CandidateFunctionRow = {
  candidate_id: string
}

export async function upsertJobScreenData(input: CreateJobInput | UpdateJobInput) {
  const updateInput = input as Partial<UpdateJobInput>

  if (updateInput.job_id) {
    return updateJob(input as UpdateJobInput)
  }

  return createJob(input as CreateJobInput)
}

export async function updateJobScreenActiveState(input: { job_id: string; organization_id: string; is_active: boolean }) {
  return setJobActiveState(input)
}

export async function upsertCandidateScreenData(input: {
  organizationId: string
  jobId: string
  fullName: string
  email: string
  resumeUrl?: string | null
  resumeText?: string | null
}) {
  try {
    const rows = await prisma.$queryRaw<CandidateFunctionRow[]>(Prisma.sql`
      select *
      from public.fn_upsert_candidate(
        ${input.organizationId}::uuid,
        ${input.jobId}::uuid,
        ${input.fullName},
        ${input.email.toLowerCase()},
        ${input.resumeUrl ?? null},
        ${input.resumeText ?? null}
      )
    `)

    const result = rows[0]

    if (!result?.candidate_id) {
      throw new Error("CANDIDATE_UPSERT_FAILED: Failed to upsert candidate")
    }

    return { candidate_id: result.candidate_id }
  } catch (error) {
    throw toFunctionApiError(error, {
      statusCode: 500,
      code: "CANDIDATE_UPSERT_FAILED",
      message: "Failed to upsert candidate",
    })
  }
}

export async function upsertRecruiterDecisionScreenData(input: {
  organizationId: string
  userId: string
  candidateId: string
  interviewId?: string | null
  attemptId?: string | null
  status: RecruiterDecisionStatus
  notes?: string | null
}) {
  return upsertRecruiterDecision(input)
}
