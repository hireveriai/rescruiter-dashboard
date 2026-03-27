import { randomUUID } from "crypto"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"
import { ApiError } from "@/lib/server/errors"

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
  accessType?: "FLEXIBLE" | "SCHEDULED"
  startTime?: string
  start_time?: string
  endTime?: string
  end_time?: string
}

type CreateInterviewContextRow = {
  job_id: string
  organization_id: string
  candidate_id: string
  candidate_organization_id: string
}

type InterviewConfigSeedRow = {
  template_id: string
  coding_weight: number | null
  verbal_weight: number | null
  system_design_weight: number | null
  total_duration_minutes: number
  mode: string | null
}

type EvaluationTemplateRow = {
  template_id: string
  coding_weight: number | null
  verbal_weight: number | null
  system_design_weight: number | null
  total_duration_minutes: number
}

type InterviewInviteValidationRow = {
  interview_id: string
  candidate_id: string
  status: string
  expires_at: Date | string | null
  used_at: Date | string | null
  access_type: string | null
  start_time: Date | string | null
  end_time: Date | string | null
}

export async function createInterviewLink(input: CreateInterviewLinkInput) {
  const jobId = String(input.jobId ?? input.job_id ?? "").trim()
  const candidateId = String(input.candidateId ?? input.candidate_id ?? "").trim()

  if (!jobId) {
    throw new ApiError(400, "INVALID_JOB_ID", "jobId is required")
  }

  if (!candidateId) {
    throw new ApiError(400, "INVALID_CANDIDATE_ID", "candidateId is required")
  }

  const accessType = input.accessType ?? "FLEXIBLE"

  let startTime: Date | null = null
  let endTime: Date | null = null
  let expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  if (accessType === "SCHEDULED") {
    const rawStartTime = input.startTime ?? input.start_time
    const rawEndTime = input.endTime ?? input.end_time

    if (!rawStartTime || !rawEndTime) {
      throw new ApiError(400, "INVALID_TIME", "Start and end time required")
    }

    startTime = new Date(rawStartTime)
    endTime = new Date(rawEndTime)

    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      throw new ApiError(400, "INVALID_TIME", "Start and end time must be valid")
    }

    if (startTime >= endTime) {
      throw new ApiError(400, "INVALID_TIME", "End time must be after start time")
    }

    expiresAt = endTime
  }

  const [contextRows, configRows, templateRows] = await Promise.all([
    prisma.$queryRaw<CreateInterviewContextRow[]>(Prisma.sql`
      select
        jp.job_id,
        jp.organization_id,
        c.candidate_id,
        c.organization_id as candidate_organization_id
      from public.job_positions jp
      join public.candidates c on c.candidate_id = ${candidateId}::uuid
      where jp.job_id = ${jobId}::uuid
      limit 1
    `),
    prisma.$queryRaw<InterviewConfigSeedRow[]>(Prisma.sql`
      select
        template_id,
        coding_weight,
        verbal_weight,
        system_design_weight,
        total_duration_minutes,
        mode
      from public.interview_configs
      where job_id = ${jobId}::uuid
      order by created_at desc
      limit 1
    `),
    prisma.$queryRaw<EvaluationTemplateRow[]>(Prisma.sql`
      select
        template_id,
        coding_weight,
        verbal_weight,
        system_design_weight,
        total_duration_minutes
      from public.evaluation_template_pool
      where coalesce(is_active, true) = true
      order by created_at desc
      limit 1
    `),
  ])

  const context = contextRows[0]
  const existingConfig = configRows[0]
  const template = templateRows[0]

  if (!context) {
    throw new ApiError(404, "INVALID_JOB_OR_CANDIDATE", "job or candidate not found")
  }

  if (context.organization_id !== context.candidate_organization_id) {
    throw new ApiError(
      400,
      "ORGANIZATION_MISMATCH",
      "candidate and job must belong to the same organization"
    )
  }

  const configSeed: InterviewConfigSeedRow | null = existingConfig
    ? existingConfig
    : template
      ? {
          template_id: template.template_id,
          coding_weight: template.coding_weight,
          verbal_weight: template.verbal_weight,
          system_design_weight: template.system_design_weight,
          total_duration_minutes: template.total_duration_minutes,
          mode: "AI",
        }
      : null

  if (!configSeed) {
    throw new ApiError(
      404,
      "TEMPLATE_NOT_FOUND",
      "No active evaluation template found to create interview config"
    )
  }

  const interview = await prisma.$transaction(async (tx) => {
    const interviewId = randomUUID()
    const token = randomUUID()

    await tx.$executeRaw(Prisma.sql`
      insert into public.interview_configs (
        interview_id,
        job_id,
        template_id,
        coding_weight,
        verbal_weight,
        system_design_weight,
        total_duration_minutes,
        mode,
        is_active
      )
      values (
        ${interviewId}::uuid,
        ${context.job_id}::uuid,
        ${configSeed.template_id}::uuid,
        ${configSeed.coding_weight},
        ${configSeed.verbal_weight},
        ${configSeed.system_design_weight},
        ${configSeed.total_duration_minutes},
        ${configSeed.mode ?? "AI"},
        true
      )
    `)

    await tx.$executeRaw(Prisma.sql`
      insert into public.interviews (
        interview_id,
        organization_id,
        job_id,
        candidate_id,
        interview_type
      )
      values (
        ${interviewId}::uuid,
        ${context.organization_id}::uuid,
        ${context.job_id}::uuid,
        ${context.candidate_id}::uuid,
        'COMPANY_INTERVIEW'
      )
    `)

    await tx.$executeRaw(Prisma.sql`
      insert into public.interview_invites (
        interview_id,
        token,
        expires_at,
        status,
        attempts_used,
        max_attempts,
        access_type,
        start_time,
        end_time
      )
      values (
        ${interviewId}::uuid,
        ${token},
        ${expiresAt.toISOString()}::timestamptz,
        'ACTIVE',
        0,
        1,
        ${accessType},
        ${startTime ? startTime.toISOString() : null}::timestamptz,
        ${endTime ? endTime.toISOString() : null}::timestamptz
      )
    `)

    return {
      token,
      interviewId,
    }
  })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

  return {
    link: `${appUrl}/interview/${interview.token}`,
    interviewId: interview.interviewId,
  }
}

export async function validateInterviewToken(
  input: ValidateInterviewTokenInput
): Promise<ValidateInterviewTokenResult> {
  const invites = await prisma.$queryRaw<InterviewInviteValidationRow[]>(Prisma.sql`
    select
      ii.interview_id,
      i.candidate_id,
      ii.status,
      ii.expires_at,
      ii.used_at,
      ii.access_type,
      ii.start_time,
      ii.end_time
    from public.interview_invites ii
    inner join public.interviews i on i.interview_id = ii.interview_id
    where ii.token = ${input.token}
    limit 1
  `)

  const invite = invites[0]

  if (!invite) {
    return {
      valid: false,
      reason: "INVALID_TOKEN",
    }
  }

  const status = String(invite.status).toUpperCase()

  if (invite.used_at || status === "USED" || status === "COMPLETED") {
    return {
      valid: false,
      reason: "USED",
    }
  }

  const now = new Date()
  const accessType = String(invite.access_type ?? "FLEXIBLE").toUpperCase()

  if (accessType === "SCHEDULED") {
    const start = invite.start_time ? new Date(invite.start_time) : null
    const end = invite.end_time ? new Date(invite.end_time) : null

    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return {
        valid: false,
        reason: "INVALID_TIME_WINDOW",
      }
    }

    if (now < start) {
      return {
        valid: false,
        reason: "NOT_STARTED",
      }
    }

    if (now > end) {
      return {
        valid: false,
        reason: "EXPIRED",
      }
    }
  }

  const expiresAt = invite.expires_at ? new Date(invite.expires_at) : null

  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || status === "EXPIRED" || expiresAt <= now) {
    return {
      valid: false,
      reason: "EXPIRED",
    }
  }

  if (status !== "ACTIVE") {
    return {
      valid: false,
      reason: "INACTIVE",
    }
  }

  await prisma.$executeRaw(Prisma.sql`
    update public.interview_invites
    set
      used_at = now(),
      attempts_used = coalesce(attempts_used, 0) + 1
    where token = ${input.token}
      and used_at is null
  `)

  return {
    valid: true,
    interviewId: invite.interview_id,
    candidateId: invite.candidate_id,
  }
}

export async function markInterviewAsUsed(token: string) {
  const result = await prisma.$executeRaw(Prisma.sql`
    update public.interview_invites
    set
      used_at = now(),
      attempts_used = coalesce(attempts_used, 0) + 1
    where token = ${token}
      and used_at is null
  `)

  if (result === 0) {
    throw new ApiError(404, "INVALID_TOKEN", "Token not found or already used")
  }

  return true
}
