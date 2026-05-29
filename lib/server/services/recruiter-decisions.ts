import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"

export const RECRUITER_DECISION_STATUSES = ["REVIEW_REQUIRED", "REVIEWED", "PROCEED", "HOLD", "REJECT"] as const

export type RecruiterDecisionStatus = typeof RECRUITER_DECISION_STATUSES[number]

export type RecruiterDecisionRecord = {
  decisionId: string
  organizationId: string
  candidateId: string
  interviewId: string | null
  attemptId: string | null
  status: RecruiterDecisionStatus
  decidedBy: string | null
  decidedAt: Date | string
  notes: string | null
}

let ensureRecruiterDecisionsPromise: Promise<void> | null = null

export function normalizeRecruiterDecisionStatus(value: unknown): RecruiterDecisionStatus | null {
  const normalized = String(value ?? "").trim().toUpperCase()
  if (normalized === "ESCALATE_REVIEW" || normalized === "REVIEW") {
    return "REVIEW_REQUIRED"
  }

  return RECRUITER_DECISION_STATUSES.includes(normalized as RecruiterDecisionStatus)
    ? normalized as RecruiterDecisionStatus
    : null
}

export async function ensureRecruiterDecisionsTable() {
  if (!ensureRecruiterDecisionsPromise) {
    ensureRecruiterDecisionsPromise = (async () => {
      await prisma.$executeRaw(Prisma.sql`
        create table if not exists public.candidate_recruiter_decisions (
          decision_id uuid primary key default gen_random_uuid(),
          organization_id uuid not null,
          candidate_id uuid not null,
          interview_id uuid,
          attempt_id uuid,
          status text not null,
          decided_by uuid,
          decided_at timestamptz not null default now(),
          notes text,
          metadata jsonb not null default '{}'::jsonb,
          constraint candidate_recruiter_decisions_status_check
            check (status in ('REVIEW_REQUIRED', 'REVIEWED', 'PROCEED', 'HOLD', 'REJECT'))
        )
      `)

      await prisma.$executeRaw(Prisma.sql`
        alter table public.candidate_recruiter_decisions
        add column if not exists notes text
      `)

      await prisma.$executeRaw(Prisma.sql`
        alter table public.candidate_recruiter_decisions
        drop constraint if exists candidate_recruiter_decisions_status_check
      `)

      await prisma.$executeRaw(Prisma.sql`
        alter table public.candidate_recruiter_decisions
        add constraint candidate_recruiter_decisions_status_check
          check (status in ('REVIEW_REQUIRED', 'REVIEWED', 'PROCEED', 'HOLD', 'REJECT'))
      `)

      await prisma.$executeRaw(Prisma.sql`
        delete from public.candidate_recruiter_decisions a
        using public.candidate_recruiter_decisions b
        where a.organization_id = b.organization_id
          and a.candidate_id = b.candidate_id
          and coalesce(a.interview_id::text, '') = coalesce(b.interview_id::text, '')
          and a.ctid < b.ctid
      `)

      await prisma.$executeRaw(Prisma.sql`
        create unique index if not exists candidate_recruiter_decisions_scope_uidx
          on public.candidate_recruiter_decisions (
            organization_id,
            candidate_id,
            coalesce(interview_id::text, '')
          )
      `)

      await prisma.$executeRaw(Prisma.sql`
        create index if not exists candidate_recruiter_decisions_org_status_idx
          on public.candidate_recruiter_decisions (organization_id, status, decided_at desc)
      `)
    })().catch((error) => {
      ensureRecruiterDecisionsPromise = null
      throw error
    })
  }

  return ensureRecruiterDecisionsPromise
}

export async function upsertRecruiterDecision(input: {
  organizationId: string
  userId: string
  candidateId: string
  interviewId?: string | null
  attemptId?: string | null
  status: RecruiterDecisionStatus
  notes?: string | null
}) {
  await ensureRecruiterDecisionsTable()

  const rows = await prisma.$queryRaw<RecruiterDecisionRecord[]>(Prisma.sql`
    insert into public.candidate_recruiter_decisions (
      organization_id,
      candidate_id,
      interview_id,
      attempt_id,
      status,
      decided_by,
      decided_at,
      notes
    )
    select
      c.organization_id,
      c.candidate_id,
      i.interview_id,
      ia.attempt_id,
      ${input.status},
      ${input.userId}::uuid,
      now(),
      ${input.notes ?? null}
    from public.candidates c
    left join public.interviews i
      on i.interview_id = ${input.interviewId ?? null}::uuid
      and i.organization_id = c.organization_id
      and i.candidate_id = c.candidate_id
    left join public.interview_attempts ia
      on ia.attempt_id = ${input.attemptId ?? null}::uuid
      and ia.interview_id = i.interview_id
    where c.organization_id = ${input.organizationId}::uuid
      and c.candidate_id = ${input.candidateId}::uuid
      and (${input.interviewId ?? null}::uuid is null or i.interview_id is not null)
      and (${input.attemptId ?? null}::uuid is null or ia.attempt_id is not null)
    on conflict (
      organization_id,
      candidate_id,
      coalesce(interview_id::text, '')
    )
    do update set
      attempt_id = excluded.attempt_id,
      status = excluded.status,
      decided_by = excluded.decided_by,
      decided_at = excluded.decided_at,
      notes = excluded.notes
    returning
      decision_id::text as "decisionId",
      organization_id::text as "organizationId",
      candidate_id::text as "candidateId",
      interview_id::text as "interviewId",
      attempt_id::text as "attemptId",
      status,
      decided_by::text as "decidedBy",
      decided_at as "decidedAt",
      notes
  `)

  return rows[0]
}

export async function getRecruiterDecisionsForInterviews(organizationId: string, interviewIds: string[]) {
  const ids = Array.from(new Set(interviewIds.filter(Boolean)))
  if (ids.length === 0) {
    return new Map<string, RecruiterDecisionRecord>()
  }

  await ensureRecruiterDecisionsTable()

  const rows = await prisma.$queryRaw<RecruiterDecisionRecord[]>(Prisma.sql`
    select
      decision_id::text as "decisionId",
      organization_id::text as "organizationId",
      candidate_id::text as "candidateId",
      interview_id::text as "interviewId",
      attempt_id::text as "attemptId",
      status,
      decided_by::text as "decidedBy",
      decided_at as "decidedAt",
      notes
    from public.candidate_recruiter_decisions
    where organization_id = ${organizationId}::uuid
      and interview_id in (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
  `).catch(() => [] as RecruiterDecisionRecord[])

  return new Map(rows.filter((row) => row.interviewId).map((row) => [row.interviewId as string, row]))
}
