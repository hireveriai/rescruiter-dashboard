import { prisma } from "@/lib/server/prisma"

export type SkillStateRecord = {
  attempt_id: string
  interview_id: string | null
  organization_id: string | null
  skills_covered: string[]
  skills_remaining: string[]
  response_metrics: unknown | null
  asked_questions: unknown | null
  answers: unknown | null
  followup_count: number
  last_question: unknown | null
  role_confidence: number | null
  adaptive_mode: boolean | null
  updated_at: string
}

export async function ensureSkillStateTable() {
  await prisma.$executeRaw`
    create table if not exists public.interview_skill_state (
      attempt_id uuid primary key,
      interview_id uuid,
      organization_id uuid,
      skills_covered text[] not null,
      skills_remaining text[] not null,
      response_metrics jsonb,
      asked_questions jsonb,
      answers jsonb,
      followup_count integer not null default 0,
      last_question jsonb,
      role_confidence double precision,
      adaptive_mode boolean,
      updated_at timestamptz not null default now()
    )
  `

  await prisma.$executeRaw`alter table public.interview_skill_state add column if not exists response_metrics jsonb`
  await prisma.$executeRaw`alter table public.interview_skill_state add column if not exists asked_questions jsonb`
  await prisma.$executeRaw`alter table public.interview_skill_state add column if not exists answers jsonb`
  await prisma.$executeRaw`alter table public.interview_skill_state add column if not exists followup_count integer not null default 0`
  await prisma.$executeRaw`alter table public.interview_skill_state add column if not exists last_question jsonb`
  await prisma.$executeRaw`alter table public.interview_skill_state add column if not exists role_confidence double precision`
  await prisma.$executeRaw`alter table public.interview_skill_state add column if not exists adaptive_mode boolean`

  await prisma.$executeRaw`
    create index if not exists idx_interview_skill_state_interview
    on public.interview_skill_state (interview_id)
  `

  await prisma.$executeRaw`
    create index if not exists idx_interview_skill_state_org
    on public.interview_skill_state (organization_id)
  `
}

export async function upsertSkillState(params: {
  attemptId: string
  interviewId?: string | null
  organizationId?: string | null
  skillsCovered: string[]
  skillsRemaining: string[]
  responseMetrics?: unknown | null
  askedQuestions?: unknown | null
  answers?: unknown | null
  followupCount?: number
  lastQuestion?: unknown | null
  roleConfidence?: number | null
  adaptiveMode?: boolean | null
}) {
  const {
    attemptId,
    interviewId,
    organizationId,
    skillsCovered,
    skillsRemaining,
    responseMetrics,
    askedQuestions,
    answers,
    followupCount,
    lastQuestion,
    roleConfidence,
    adaptiveMode,
  } = params

  await ensureSkillStateTable()

  await prisma.$executeRaw`
    insert into public.interview_skill_state (
      attempt_id,
      interview_id,
      organization_id,
      skills_covered,
      skills_remaining,
      response_metrics,
      asked_questions,
      answers,
      followup_count,
      last_question,
      role_confidence,
      adaptive_mode,
      updated_at
    )
    values (
      ${attemptId}::uuid,
      ${interviewId ?? null}::uuid,
      ${organizationId ?? null}::uuid,
      ${skillsCovered}::text[],
      ${skillsRemaining}::text[],
      ${JSON.stringify(responseMetrics ?? null)}::jsonb,
      ${JSON.stringify(askedQuestions ?? null)}::jsonb,
      ${JSON.stringify(answers ?? null)}::jsonb,
      ${followupCount ?? 0},
      ${JSON.stringify(lastQuestion ?? null)}::jsonb,
      ${roleConfidence ?? null},
      ${adaptiveMode ?? null},
      now()
    )
    on conflict (attempt_id)
    do update set
      interview_id = excluded.interview_id,
      organization_id = excluded.organization_id,
      skills_covered = excluded.skills_covered,
      skills_remaining = excluded.skills_remaining,
      response_metrics = coalesce(excluded.response_metrics, public.interview_skill_state.response_metrics),
      asked_questions = coalesce(excluded.asked_questions, public.interview_skill_state.asked_questions),
      answers = coalesce(excluded.answers, public.interview_skill_state.answers),
      followup_count = excluded.followup_count,
      last_question = coalesce(excluded.last_question, public.interview_skill_state.last_question),
      role_confidence = coalesce(excluded.role_confidence, public.interview_skill_state.role_confidence),
      adaptive_mode = coalesce(excluded.adaptive_mode, public.interview_skill_state.adaptive_mode),
      updated_at = now()
  `
}

export async function fetchSkillState(attemptId: string): Promise<SkillStateRecord | null> {
  await ensureSkillStateTable()

  const rows = await prisma.$queryRaw`
    select
      attempt_id,
      interview_id,
      organization_id,
      skills_covered,
      skills_remaining,
      response_metrics,
      asked_questions,
      answers,
      followup_count,
      last_question,
      role_confidence,
      adaptive_mode,
      updated_at
    from public.interview_skill_state
    where attempt_id = ${attemptId}::uuid
    limit 1
  `

  const result = Array.isArray(rows) ? (rows[0] as SkillStateRecord | undefined) : undefined
  return result ?? null
}
