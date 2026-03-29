import type { z } from "zod"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"
import { inviteInterviewSchema } from "@/lib/server/validators"
import { toFunctionApiError } from "@/lib/server/function-errors"

type InviteInterviewInput = z.infer<typeof inviteInterviewSchema>

type InviteRow = {
  interview_link: string
  token: string
  expires_at: Date | string
}

export async function createInterviewInvite(input: InviteInterviewInput) {
  try {
    const rows = await prisma.$queryRaw<InviteRow[]>(Prisma.sql`
      select *
      from public.fn_create_interview_invite(
        ${input.interview_id}::uuid,
        ${input.candidate_id}::uuid,
        ${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}
      )
    `)

    const invite = rows[0]

    if (!invite?.token) {
      throw new Error("INVITE_CREATE_FAILED: Failed to create invite")
    }

    return {
      interview_link: invite.interview_link,
      token: invite.token,
      expires_at: new Date(invite.expires_at).toISOString(),
    }
  } catch (error) {
    throw toFunctionApiError(error, {
      statusCode: 500,
      code: "INVITE_CREATE_FAILED",
      message: "Failed to create invite",
    })
  }
}
