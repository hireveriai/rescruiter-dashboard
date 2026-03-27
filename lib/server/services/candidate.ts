import type { z } from "zod"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"
import { ApiError } from "@/lib/server/errors"
import { createCandidateSchema } from "@/lib/server/validators"

type CreateCandidateInput = z.infer<typeof createCandidateSchema>

type JobContextRow = {
  organization_id: string
}

type UserRow = {
  user_id: string
  organization_id: string
}

type CandidateRow = {
  candidate_id: string
}

function getNameParts(fullName: string) {
  const parts = fullName.trim().split(/\s+/)
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  }
}

export async function createCandidate(input: CreateCandidateInput) {
  const fullName = String(input.fullName ?? input.name ?? "").trim()
  const jobId = String(input.jobId ?? input.job_id ?? "").trim()
  const email = input.email.trim().toLowerCase()

  const jobRows = await prisma.$queryRaw<JobContextRow[]>(Prisma.sql`
    select organization_id
    from public.job_positions
    where job_id = ${jobId}::uuid
    limit 1
  `)

  const job = jobRows[0]

  if (!job) {
    throw new ApiError(404, "JOB_NOT_FOUND", "jobId not found")
  }

  const { firstName, lastName } = getNameParts(fullName)

  const candidate = await prisma.$transaction(async (tx) => {
    const existingUsers = await tx.$queryRaw<UserRow[]>(Prisma.sql`
      select user_id, organization_id
      from public.users
      where email = ${email}
      limit 1
    `)

    let user = existingUsers[0]

    if (user && user.organization_id !== job.organization_id) {
      throw new ApiError(
        409,
        "USER_ORGANIZATION_MISMATCH",
        "User already exists under a different organization"
      )
    }

    if (!user) {
      const createdUsers = await tx.$queryRaw<UserRow[]>(Prisma.sql`
        insert into public.users (
          organization_id,
          full_name,
          email,
          role,
          is_active,
          first_name,
          last_name
        )
        values (
          ${job.organization_id}::uuid,
          ${fullName},
          ${email},
          'CANDIDATE',
          true,
          ${firstName},
          ${lastName}
        )
        returning user_id, organization_id
      `)

      user = createdUsers[0]
    }

    const existingCandidates = await tx.$queryRaw<CandidateRow[]>(Prisma.sql`
      select candidate_id
      from public.candidates
      where user_id = ${user.user_id}::uuid
         or email = ${email}
      order by created_at asc
      limit 1
    `)

    if (existingCandidates[0]) {
      return existingCandidates[0]
    }

    const createdCandidates = await tx.$queryRaw<CandidateRow[]>(Prisma.sql`
      insert into public.candidates (
        user_id,
        organization_id,
        full_name,
        email
      )
      values (
        ${user.user_id}::uuid,
        ${job.organization_id}::uuid,
        ${fullName},
        ${email}
      )
      returning candidate_id
    `)

    const createdCandidate = createdCandidates[0]

    if (!createdCandidate) {
      throw new ApiError(500, "CANDIDATE_CREATE_FAILED", "Failed to create candidate")
    }

    return createdCandidate
  })

  return { candidate_id: candidate.candidate_id }
}
