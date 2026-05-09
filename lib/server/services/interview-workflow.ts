import { Prisma } from "@prisma/client"

import { generateInterviewQuestions } from "@/lib/interview-flow"
import { ApiError } from "@/lib/server/errors"
import { getInterviewAppUrl } from "@/lib/server/interview-url"
import { prisma } from "@/lib/server/prisma"
import { parseResumeText } from "@/lib/server/resumeParser"
import {
  clearInterviewQuestions,
  fetchExistingInterviewQuestions,
  replaceInterviewQuestions,
  verifyInterviewQuestionsPersisted,
} from "@/lib/server/services/interview-questions"
import { sendInterviewEmail } from "@/lib/services/email.service"

const CREATE_LINK_AI_TIMEOUT_MS = 12000
const MIN_QUESTION_COUNT = 5
const QUESTION_RETRY_COUNT = 3
const BASE_BACKOFF_MS = 400

type PreparingInterviewInput = {
  organizationId: string
  jobId: string
  candidateId: string
  accessType?: string | null
  startTime?: string | null
  endTime?: string | null
  idempotencyKey?: string | null
}

type InterviewWorkflowRow = {
  interview_id: string
  token: string | null
  link: string | null
  status: string | null
  question_status: string | null
  email_status: string | null
  failure_reason: string | null
  last_error: string | null
  questions_generated_at: Date | string | null
  email_sent_at: Date | string | null
}

type InterviewContextRow = {
  interview_id: string
  organization_id: string
  job_id: string
  candidate_id: string
  job_title: string | null
  job_description: string | null
  core_skills: string[] | null
  experience_level_id: number | null
  interview_duration_minutes: number | null
  candidate_name: string | null
  candidate_email: string | null
  resume_text: string | null
  start_time?: Date | string | null
  end_time?: Date | string | null
  organization_timezone?: string | null
  organization_timezone_label?: string | null
  token: string | null
  link: string | null
  status?: string | null
  question_status?: string | null
  email_status?: string | null
}

type GenerateQuestionInput = {
  organizationId: string
  interviewId: string
  candidateResumeText?: string
  resumeSkills?: string[]
  totalQuestions?: number
  interviewDurationMinutes?: number
  similarityThreshold?: number
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error"
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

function mapWorkflowRow(row: InterviewWorkflowRow) {
  return {
    interviewId: row.interview_id,
    token: row.token ?? "",
    link: row.link ?? "",
    status: row.status,
    questionStatus: row.question_status,
    emailStatus: row.email_status,
    failureReason: row.failure_reason,
    lastError: row.last_error,
    questionsGeneratedAt: row.questions_generated_at,
    emailSentAt: row.email_sent_at,
  }
}

export async function ensureInterviewWorkflowSchema() {
  await prisma.$executeRawUnsafe(`
    alter table public.interviews
      add column if not exists question_status text not null default 'PENDING',
      add column if not exists email_status text not null default 'PENDING',
      add column if not exists failure_reason text,
      add column if not exists last_error text,
      add column if not exists questions_generated_at timestamptz,
      add column if not exists email_sent_at timestamptz,
      add column if not exists idempotency_key text
  `)

  await prisma.$executeRawUnsafe(`
    create unique index if not exists idx_interviews_org_idempotency_key
      on public.interviews (organization_id, idempotency_key)
      where idempotency_key is not null
  `)

  await prisma.$executeRawUnsafe(`
    alter table public.interview_invites
      drop constraint if exists interview_invites_status_check,
      drop constraint if exists status_check
  `)

  await prisma.$executeRawUnsafe(`
    alter table public.interview_invites
      add constraint interview_invites_status_check
      check (
        status = any (
          array[
            'ACTIVE',
            'EXPIRED',
            'USED',
            'REVOKED',
            'COMPLETED',
            'CANCELLED',
            'PREPARING',
            'PREPARATION_FAILED'
          ]::text[]
        )
      )
  `)
}

async function getWorkflowByIdempotencyKey(organizationId: string, idempotencyKey: string) {
  const appUrl = getInterviewAppUrl().replace(/\/$/, "")
  const rows = await prisma.$queryRaw<InterviewWorkflowRow[]>(Prisma.sql`
    select
      i.interview_id::text,
      ii.token,
      case when ii.token is null then null else ${appUrl} || '/interview/' || ii.token end as link,
      i.status,
      i.question_status,
      i.email_status,
      i.failure_reason,
      i.last_error,
      i.questions_generated_at,
      i.email_sent_at
    from public.interviews i
    left join lateral (
      select token
      from public.interview_invites
      where interview_id = i.interview_id
      order by created_at desc
      limit 1
    ) ii on true
    where i.organization_id = ${organizationId}::uuid
      and i.idempotency_key = ${idempotencyKey}
    limit 1
  `)

  return rows[0] ? mapWorkflowRow(rows[0]) : null
}

export async function createPreparingInterview(input: PreparingInterviewInput) {
  await ensureInterviewWorkflowSchema()

  if (input.idempotencyKey) {
    const existing = await getWorkflowByIdempotencyKey(input.organizationId, input.idempotencyKey)
    if (existing) {
      return { ...existing, reused: true }
    }
  }

  const appUrl = getInterviewAppUrl()

  const result = await prisma.$transaction(async (tx) => {
    if (input.idempotencyKey) {
      await tx.$executeRaw(Prisma.sql`select pg_advisory_xact_lock(hashtext(${input.organizationId || ""}), hashtext(${input.idempotencyKey}))`)
      const existingRows = await tx.$queryRaw<InterviewWorkflowRow[]>(Prisma.sql`
        select
          i.interview_id::text,
          ii.token,
          case when ii.token is null then null else ${appUrl.replace(/\/$/, "")} || '/interview/' || ii.token end as link,
          i.status,
          i.question_status,
          i.email_status,
          i.failure_reason,
          i.last_error,
          i.questions_generated_at,
          i.email_sent_at
        from public.interviews i
        left join lateral (
          select token
          from public.interview_invites
          where interview_id = i.interview_id
          order by created_at desc
          limit 1
        ) ii on true
        where i.organization_id = ${input.organizationId}::uuid
          and i.idempotency_key = ${input.idempotencyKey}
        limit 1
      `)

      if (existingRows[0]) {
        return { ...mapWorkflowRow(existingRows[0]), reused: true }
      }
    }

    const rows = await tx.$queryRaw<{ interview_id: string; token: string; link: string }[]>(Prisma.sql`
      select *
      from public.fn_create_interview_link(
        ${input.organizationId}::uuid,
        ${input.jobId}::uuid,
        ${input.candidateId}::uuid,
        ${input.accessType ?? "FLEXIBLE"},
        ${input.startTime ?? null}::timestamptz,
        ${input.endTime ?? null}::timestamptz,
        ${appUrl}
      )
    `)

    const created = rows[0]
    if (!created?.interview_id || !created?.link) {
      throw new ApiError(500, "INTERVIEW_LINK_CREATE_FAILED", "Failed to create interview link")
    }

    await tx.$executeRaw(Prisma.sql`
      update public.interviews
      set
        status = 'PREPARING',
        question_status = 'GENERATING',
        email_status = 'PENDING',
        failure_reason = null,
        last_error = null,
        questions_generated_at = null,
        email_sent_at = null,
        idempotency_key = ${input.idempotencyKey ?? null}
      where interview_id = ${created.interview_id}::uuid
        and organization_id = ${input.organizationId}::uuid
    `)

    await tx.$executeRaw(Prisma.sql`
      update public.interview_invites
      set status = 'PREPARING'
      where interview_id = ${created.interview_id}::uuid
    `)

    return {
      interviewId: created.interview_id,
      token: created.token,
      link: created.link,
      status: "PREPARING",
      questionStatus: "GENERATING",
      emailStatus: "PENDING",
      failureReason: null,
      lastError: null,
      questionsGeneratedAt: null,
      emailSentAt: null,
      reused: false,
    }
  })

  return result
}

async function getInterviewContext(organizationId: string, interviewId: string) {
  const appUrl = getInterviewAppUrl().replace(/\/$/, "")
  const rows = await prisma.$queryRaw<InterviewContextRow[]>(Prisma.sql`
    select
      i.interview_id::text,
      i.organization_id::text,
      i.job_id::text,
      i.candidate_id::text,
      jp.job_title,
      jp.job_description,
      jp.core_skills,
      jp.experience_level_id,
      jp.interview_duration_minutes,
      c.full_name as candidate_name,
      c.email as candidate_email,
      c.resume_text,
      ii.start_time,
      ii.end_time,
      o.timezone as organization_timezone,
      o.timezone_label as organization_timezone_label,
      ii.token,
      i.status,
      i.question_status,
      i.email_status,
      case when ii.token is null then null else ${appUrl} || '/interview/' || ii.token end as link
    from public.interviews i
    inner join public.job_positions jp on jp.job_id = i.job_id
    inner join public.candidates c on c.candidate_id = i.candidate_id
    inner join public.organizations o on o.organization_id = i.organization_id
    left join lateral (
      select token
      from public.interview_invites
      where interview_id = i.interview_id
      order by created_at desc
      limit 1
    ) ii on true
    where i.interview_id = ${interviewId}::uuid
      and i.organization_id = ${organizationId}::uuid
    limit 1
  `)

  if (!rows[0]) {
    throw new ApiError(404, "INTERVIEW_NOT_FOUND", "Interview not found for this organization")
  }

  return rows[0]
}

export async function markQuestionGenerationFailed(organizationId: string, interviewId: string, error: unknown) {
  const message = normalizeMessage(error)

  await prisma.$executeRaw(Prisma.sql`
    update public.interviews
    set
      status = 'FAILED',
      question_status = 'FAILED',
      email_status = case when email_status = 'SENT' then email_status else 'PENDING' end,
      failure_reason = 'AI_QUESTION_GENERATION_FAILED',
      last_error = ${message},
      is_active = false
    where interview_id = ${interviewId}::uuid
      and organization_id = ${organizationId}::uuid
  `)

  await prisma.$executeRaw(Prisma.sql`
    update public.interview_invites
    set status = 'PREPARATION_FAILED'
    where interview_id = ${interviewId}::uuid
      and coalesce(status, 'ACTIVE') <> 'USED'
  `)
}

async function markQuestionGenerationStarted(organizationId: string, interviewId: string) {
  await ensureInterviewWorkflowSchema()
  await prisma.$executeRaw(Prisma.sql`
    update public.interviews
    set
      status = 'PREPARING',
      question_status = 'GENERATING',
      failure_reason = null,
      last_error = null,
      is_active = true
    where interview_id = ${interviewId}::uuid
      and organization_id = ${organizationId}::uuid
  `)
}

async function markQuestionGenerationSucceeded(organizationId: string, interviewId: string) {
  await prisma.$executeRaw(Prisma.sql`
    update public.interviews
    set
      status = 'READY',
      question_status = 'COMPLETED',
      failure_reason = null,
      last_error = null,
      questions_generated_at = now(),
      is_active = true
    where interview_id = ${interviewId}::uuid
      and organization_id = ${organizationId}::uuid
  `)

  await prisma.$executeRaw(Prisma.sql`
    update public.interview_invites
    set status = 'ACTIVE'
    where interview_id = ${interviewId}::uuid
      and coalesce(status, 'ACTIVE') in ('PREPARING', 'PREPARATION_FAILED', 'ACTIVE')
  `)
}

export async function prepareInterviewQuestionsWithRetry(input: GenerateQuestionInput) {
  await markQuestionGenerationStarted(input.organizationId, input.interviewId)
  const context = await getInterviewContext(input.organizationId, input.interviewId)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= QUESTION_RETRY_COUNT; attempt += 1) {
    try {
      const candidateResumeText = input.candidateResumeText || context.resume_text || undefined
      const parsedResumeSkills = candidateResumeText ? parseResumeText(candidateResumeText).skills ?? [] : []
      const resumeSkills = input.resumeSkills && input.resumeSkills.length > 0 ? input.resumeSkills : parsedResumeSkills

      const cleared = await clearInterviewQuestions(input.interviewId)
      if (!cleared) {
        throw new Error("Failed to clear existing interview questions")
      }

      const generatedQuestions = await withTimeout(
        generateInterviewQuestions({
          jobDescription: context.job_description ?? undefined,
          coreSkills: context.core_skills ?? [],
          candidateResumeText,
          candidateResumeSkills: resumeSkills,
          candidateId: context.candidate_id,
          jobId: context.job_id,
          experienceLevel: String(context.experience_level_id ?? ""),
          totalQuestions: input.totalQuestions,
          interviewDurationMinutes: input.interviewDurationMinutes ?? context.interview_duration_minutes ?? undefined,
          jobTitle: context.job_title ?? undefined,
          previousQuestions: [],
          similarityThreshold: input.similarityThreshold ?? 0.8,
        }),
        CREATE_LINK_AI_TIMEOUT_MS,
        "AI question generation timed out"
      )

      if (generatedQuestions.length < MIN_QUESTION_COUNT) {
        throw new Error("Generated too few questions")
      }

      const replaced = await replaceInterviewQuestions(input.interviewId, generatedQuestions)
      if (!replaced) {
        const existingQuestions = await fetchExistingInterviewQuestions(input.interviewId)
        if (existingQuestions.length === 0) {
          throw new Error("Generated interview questions could not be saved")
        }
      }

      const verified = await verifyInterviewQuestionsPersisted(input.interviewId, generatedQuestions)
      if (!verified) {
        const existingQuestions = await fetchExistingInterviewQuestions(input.interviewId)
        if (existingQuestions.length === 0) {
          throw new Error("Interview questions were generated but could not be verified after saving")
        }
      }

      await markQuestionGenerationSucceeded(input.organizationId, input.interviewId)
      return { success: true }
    } catch (error) {
      lastError = error
      if (attempt < QUESTION_RETRY_COUNT) {
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1))
      }
    }
  }

  await markQuestionGenerationFailed(input.organizationId, input.interviewId, lastError)
  throw new ApiError(502, "AI_QUESTION_GENERATION_FAILED", normalizeMessage(lastError))
}

async function markEmailSending(organizationId: string, interviewId: string) {
  await prisma.$executeRaw(Prisma.sql`
    update public.interviews
    set
      email_status = 'SENDING',
      last_error = null
    where interview_id = ${interviewId}::uuid
      and organization_id = ${organizationId}::uuid
      and status = 'READY'
  `)
}

export async function markEmailFailed(organizationId: string, interviewId: string, error: unknown) {
  await prisma.$executeRaw(Prisma.sql`
    update public.interviews
    set
      email_status = 'FAILED',
      last_error = ${normalizeMessage(error)}
    where interview_id = ${interviewId}::uuid
      and organization_id = ${organizationId}::uuid
      and status = 'READY'
  `)
}

async function markEmailSucceeded(organizationId: string, interviewId: string) {
  await prisma.$executeRaw(Prisma.sql`
    update public.interviews
    set
      email_status = 'SENT',
      email_sent_at = now(),
      last_error = null
    where interview_id = ${interviewId}::uuid
      and organization_id = ${organizationId}::uuid
      and status = 'READY'
  `)
}

export async function sendInterviewEmailForInterview(organizationId: string, interviewId: string) {
  const context = await getInterviewContext(organizationId, interviewId)

  if (String(context.status ?? "").toUpperCase() !== "READY" || String(context.question_status ?? "").toUpperCase() !== "COMPLETED") {
    throw new ApiError(409, "INTERVIEW_NOT_READY", "Interview is not ready for email delivery")
  }

  if (!context.link) {
    throw new ApiError(409, "INTERVIEW_LINK_NOT_READY", "Interview link is not available")
  }

  if (!context.candidate_email) {
    throw new ApiError(404, "CANDIDATE_EMAIL_NOT_FOUND", "Candidate email not found")
  }

  await markEmailSending(organizationId, interviewId)

  try {
    await sendInterviewEmail({
      to: context.candidate_email,
      name: context.candidate_name || "Candidate",
      link: context.link,
      organizationTimezone: context.organization_timezone ?? null,
      organizationTimezoneLabel: context.organization_timezone_label ?? null,
      scheduledStartUtc: context.start_time ?? null,
      scheduledEndUtc: context.end_time ?? null,
    })
    await markEmailSucceeded(organizationId, interviewId)
    return { emailSent: true, emailError: null, link: context.link }
  } catch (error) {
    await markEmailFailed(organizationId, interviewId, error)
    return { emailSent: false, emailError: normalizeMessage(error), link: context.link }
  }
}
