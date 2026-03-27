import type { z } from "zod"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"
import { ApiError } from "@/lib/server/errors"
import { generateInviteToken } from "@/lib/server/token"
import { getExpiryDate } from "@/lib/server/expiry"
import { inviteInterviewSchema } from "@/lib/server/validators"

type InviteInterviewInput = z.infer<typeof inviteInterviewSchema>

type InterviewRow = {
  interview_id: string
  candidate_id: string
}

async function generateUniqueInviteToken() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateInviteToken()
    const existingInvite = await prisma.interviewInvite.findUnique({
      where: { token },
      select: { inviteId: true },
    })

    if (!existingInvite) {
      return token
    }
  }

  throw new ApiError(500, "TOKEN_GENERATION_FAILED", "Failed to generate a unique invite token")
}

export async function createInterviewInvite(input: InviteInterviewInput) {
  const interviews = await prisma.$queryRaw<InterviewRow[]>(Prisma.sql`
    select interview_id, candidate_id
    from public.interviews
    where interview_id = ${input.interview_id}::uuid
    limit 1
  `)

  const interview = interviews[0]

  if (!interview) {
    throw new ApiError(404, "INTERVIEW_NOT_FOUND", "interview_id not found")
  }

  if (interview.candidate_id !== input.candidate_id) {
    throw new ApiError(400, "CANDIDATE_MISMATCH", "candidate_id does not match interview")
  }

  const token = await generateUniqueInviteToken()
  const expiresAt = getExpiryDate(24)

  await prisma.$executeRaw(Prisma.sql`
    insert into public.interview_invites (
      interview_id,
      token,
      expires_at,
      status,
      attempts_used,
      max_attempts,
      access_type
    )
    values (
      ${input.interview_id}::uuid,
      ${token},
      ${expiresAt.toISOString()}::timestamptz,
      'ACTIVE',
      0,
      1,
      'FLEXIBLE'
    )
  `)

  return {
    interview_link: `/interview/${token}`,
    token,
    expires_at: expiresAt.toISOString(),
  }
}
