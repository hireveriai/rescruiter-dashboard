import type { z } from "zod"

import { prisma } from "@/lib/server/prisma"
import { createCandidateSchema } from "@/lib/server/validators"
import { toFunctionApiError } from "@/lib/server/function-errors"
import { upsertCandidateScreenData } from "@/lib/server/services/recruiter-screen-writes"

type CreateCandidateInput = z.infer<typeof createCandidateSchema>

export async function createCandidate(input: CreateCandidateInput) {
  const fullName = String(input.fullName ?? input.name ?? "").trim()
  const jobId = String(input.jobId ?? input.job_id ?? "").trim()
  const email = input.email.trim().toLowerCase()

  try {
    const job = await prisma.jobPosition.findUnique({
      where: { jobId },
      select: { organizationId: true },
    })

    if (!job) {
      throw new Error("JOB_NOT_FOUND: jobId not found")
    }

    const candidate = await upsertCandidateScreenData({
      organizationId: job.organizationId,
      jobId,
      fullName,
      email,
    })

    if (!candidate?.candidate_id) {
      throw new Error("CANDIDATE_CREATE_FAILED: Failed to create candidate")
    }

    return { candidate_id: candidate.candidate_id }
  } catch (error) {
    throw toFunctionApiError(error, {
      statusCode: 500,
      code: "CANDIDATE_CREATE_FAILED",
      message: "Failed to create candidate",
    })
  }
}
