import { prisma } from "@/lib/server/prisma"

export type SkillStateRecord = {
  attempt_id: string
  interview_id: string | null
  organization_id: string | null
  skills_covered: string[]
  skills_remaining: string[]
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
      updated_at timestamptz not null default now()
    )
  `

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
}) {
  const { attemptId, interviewId, organizationId, skillsCovered, skillsRemaining } = params

  await ensureSkillStateTable()

  await prisma.$executeRaw`
    insert into public.interview_skill_state (
      attempt_id,
      interview_id,
      organization_id,
      skills_covered,
      skills_remaining,
      updated_at
    )
    values (
      ${attemptId}::uuid,
      ${interviewId ?? null}::uuid,
      ${organizationId ?? null}::uuid,
      ${skillsCovered}::text[],
      ${skillsRemaining}::text[],
      now()
    )
    on conflict (attempt_id)
    do update set
      interview_id = excluded.interview_id,
      organization_id = excluded.organization_id,
      skills_covered = excluded.skills_covered,
      skills_remaining = excluded.skills_remaining,
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
      updated_at
    from public.interview_skill_state
    where attempt_id = ${attemptId}::uuid
    limit 1
  `

  const result = Array.isArray(rows) ? (rows[0] as SkillStateRecord | undefined) : undefined
  return result ?? null
}
