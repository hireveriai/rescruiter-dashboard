import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"
import { ApiError } from "@/lib/server/errors"
import { toFunctionApiError } from "@/lib/server/function-errors"
import { getInterviewAppUrl } from "@/lib/server/interview-url"

export type ValidateInterviewTokenInput = {
  token: string
}

export type ValidateInterviewTokenResult = {
  valid: boolean
  reason?: "INVALID_TOKEN" | "INACTIVE" | "EXPIRED" | "USED" | "INVALID_TIME_WINDOW" | "NOT_STARTED"
  interviewId?: string
  candidateId?: string
}

export type CreateInterviewLinkInput = {
  jobId?: string
  job_id?: string
  candidateId?: string
  candidate_id?: string
  organizationId?: string
  accessType?: "FLEXIBLE" | "SCHEDULED"
  startTime?: string
  start_time?: string
  endTime?: string
  end_time?: string
}

export type UpdateInterviewInviteInput = {
  inviteId: string
  organizationId: string
  accessType: "FLEXIBLE" | "SCHEDULED"
  startTime?: string | null
  endTime?: string | null
}

export type RevokeInterviewInviteInput = {
  inviteId: string
  organizationId: string
  reason?: string | null
}

type CreateInterviewLinkRow = {
  interview_id: string
  token: string
  link: string
}

type ValidateInterviewTokenRow = {
  valid: boolean
  reason: ValidateInterviewTokenResult["reason"] | null
  interview_id: string | null
  candidate_id: string | null
}

type UpdateInterviewInviteRow = {
  invite_id: string
  interview_id: string
  access_type: string
  start_time: string | null
  end_time: string | null
  expires_at: string | null
  status: string
}

type RevokeInterviewInviteRow = {
  invite_id: string
  interview_id: string
  status: string
  revoked_at: string | null
  revoked_reason: string | null
}

export async function createInterviewLink(input: CreateInterviewLinkInput) {
  const jobId = String(input.jobId ?? input.job_id ?? "").trim()
  const candidateId = String(input.candidateId ?? input.candidate_id ?? "").trim()
  const organizationId = String(input.organizationId ?? "").trim()

  if (!jobId) {
    throw new ApiError(400, "INVALID_JOB_ID", "jobId is required")
  }

  if (!candidateId) {
    throw new ApiError(400, "INVALID_CANDIDATE_ID", "candidateId is required")
  }

  if (!organizationId) {
    throw new ApiError(400, "INVALID_ORGANIZATION_ID", "organizationId is required")
  }

  try {
    const rows = await prisma.$queryRaw<CreateInterviewLinkRow[]>(Prisma.sql`
      select *
      from public.fn_create_interview_link(
        ${organizationId}::uuid,
        ${jobId}::uuid,
        ${candidateId}::uuid,
        ${input.accessType ?? "FLEXIBLE"},
        ${input.startTime ?? input.start_time ?? null}::timestamptz,
        ${input.endTime ?? input.end_time ?? null}::timestamptz,
        ${getInterviewAppUrl()}
      )
    `)

    const result = rows[0]

    if (!result?.interview_id || !result?.link) {
      throw new ApiError(500, "INTERVIEW_LINK_CREATE_FAILED", "Failed to create interview link")
    }

    return {
      link: result.link,
      interviewId: result.interview_id,
      token: result.token,
    }
  } catch (error) {
    throw toFunctionApiError(error, {
      statusCode: 500,
      code: "INTERVIEW_LINK_CREATE_FAILED",
      message: "Failed to create interview link",
    })
  }
}

export async function updateInterviewInvite(input: UpdateInterviewInviteInput) {
  try {
    const rows = await prisma.$queryRaw<UpdateInterviewInviteRow[]>(Prisma.sql`
      select *
      from public.fn_update_interview_invite(
        ${input.organizationId}::uuid,
        ${input.inviteId}::uuid,
        ${input.accessType},
        ${input.startTime ?? null}::timestamptz,
        ${input.endTime ?? null}::timestamptz
      )
    `)

    const result = rows[0]

    if (!result?.invite_id) {
      throw new ApiError(500, "INTERVIEW_INVITE_UPDATE_FAILED", "Failed to update interview invite")
    }

    return {
      inviteId: result.invite_id,
      interviewId: result.interview_id,
      accessType: result.access_type,
      startTime: result.start_time,
      endTime: result.end_time,
      expiresAt: result.expires_at,
      status: result.status,
    }
  } catch (error) {
    throw toFunctionApiError(error, {
      statusCode: 500,
      code: "INTERVIEW_INVITE_UPDATE_FAILED",
      message: "Failed to update interview invite",
    })
  }
}

export async function revokeInterviewInvite(input: RevokeInterviewInviteInput) {
  try {
    const rows = await prisma.$queryRaw<RevokeInterviewInviteRow[]>(Prisma.sql`
      select *
      from public.fn_revoke_interview_invite(
        ${input.organizationId}::uuid,
        ${input.inviteId}::uuid,
        ${input.reason ?? null}
      )
    `)

    const result = rows[0]

    if (!result?.invite_id) {
      throw new ApiError(500, "INTERVIEW_INVITE_REVOKE_FAILED", "Failed to revoke interview invite")
    }

    return {
      inviteId: result.invite_id,
      interviewId: result.interview_id,
      status: result.status,
      revokedAt: result.revoked_at,
      revokedReason: result.revoked_reason,
    }
  } catch (error) {
    throw toFunctionApiError(error, {
      statusCode: 500,
      code: "INTERVIEW_INVITE_REVOKE_FAILED",
      message: "Failed to revoke interview invite",
    })
  }
}

export async function validateInterviewToken(
  input: ValidateInterviewTokenInput
): Promise<ValidateInterviewTokenResult> {
  try {
    const rows = await prisma.$queryRaw<ValidateInterviewTokenRow[]>(Prisma.sql`
      select *
      from public.fn_validate_interview_token(${input.token})
    `)

    const result = rows[0]

    if (!result) {
      return {
        valid: false,
        reason: "INVALID_TOKEN",
      }
    }

    return {
      valid: result.valid,
      reason: result.reason ?? undefined,
      interviewId: result.interview_id ?? undefined,
      candidateId: result.candidate_id ?? undefined,
    }
  } catch (error) {
    throw toFunctionApiError(error, {
      statusCode: 500,
      code: "INTERVIEW_TOKEN_VALIDATE_FAILED",
      message: "Failed to validate interview token",
    })
  }
}

export async function markInterviewAsUsed(token: string) {
  const result = await validateInterviewToken({ token })

  if (!result.valid) {
    throw new ApiError(404, result.reason ?? "INVALID_TOKEN", "Token not found or already used")
  }

  return true
}
