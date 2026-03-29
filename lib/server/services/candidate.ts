import type { z } from "zod"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"
import { createCandidateSchema } from "@/lib/server/validators"
import { toFunctionApiError } from "@/lib/server/function-errors"

type CreateCandidateInput = z.infer<typeof createCandidateSchema>

type CandidateRow = {
  candidate_id: string
}

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

    const rows = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
      select *
      from public.fn_upsert_candidate(
        ${job.organizationId}::uuid,
        ${jobId}::uuid,
        ${fullName},
        ${email},
        ${null},
        ${null}
      )
    `)

    const candidate = rows[0]

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
