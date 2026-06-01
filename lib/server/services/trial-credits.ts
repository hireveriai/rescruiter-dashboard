import { Prisma } from "@prisma/client"

import { ApiError } from "@/lib/server/errors"
import { prisma } from "@/lib/server/prisma"

export const FREE_TRIAL_INTERVIEW_CREDITS = 5
export const FREE_TRIAL_SCREENING_CREDITS = 15
export const FREE_TRIAL_LIMIT_MESSAGE =
  "You’ve reached your free trial limit. Upgrade your workspace to continue conducting interviews and screenings."

export type TrialCreditKind = "INTERVIEW" | "SCREENING"

export type TrialCreditSnapshot = {
  organizationId: string
  interviewCreditsRemaining: number
  screeningCreditsRemaining: number
  canSendInterview: boolean
  canStartScreening: boolean
  upgradeMessage: string
}

type TrialCreditRow = {
  organization_id: string
  interview_credits_remaining: number
  screening_credits_remaining: number
}

type QueryClient = typeof prisma | Prisma.TransactionClient

function normalizeCount(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

function mapTrialCreditRow(row: TrialCreditRow): TrialCreditSnapshot {
  const interviewCreditsRemaining = normalizeCount(row.interview_credits_remaining)
  const screeningCreditsRemaining = normalizeCount(row.screening_credits_remaining)

  return {
    organizationId: row.organization_id,
    interviewCreditsRemaining,
    screeningCreditsRemaining,
    canSendInterview: interviewCreditsRemaining > 0,
    canStartScreening: screeningCreditsRemaining > 0,
    upgradeMessage: FREE_TRIAL_LIMIT_MESSAGE,
  }
}

export async function ensureTrialCreditSchema(client: QueryClient = prisma) {
  await client.$executeRaw(Prisma.sql`
    create table if not exists public.workspace_trial_credits (
      organization_id uuid primary key references public.organizations(organization_id) on delete cascade,
      interview_credits_remaining integer not null default ${FREE_TRIAL_INTERVIEW_CREDITS},
      screening_credits_remaining integer not null default ${FREE_TRIAL_SCREENING_CREDITS},
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint workspace_trial_credits_interview_non_negative check (interview_credits_remaining >= 0),
      constraint workspace_trial_credits_screening_non_negative check (screening_credits_remaining >= 0)
    )
  `)

  await client.$executeRaw(Prisma.sql`
    create index if not exists workspace_trial_credits_updated_at_idx
      on public.workspace_trial_credits (updated_at desc)
  `)
}

export async function getOrCreateTrialCredits(organizationId: string, client: QueryClient = prisma) {
  await ensureTrialCreditSchema(client)

  const rows = await client.$queryRaw<TrialCreditRow[]>(Prisma.sql`
    insert into public.workspace_trial_credits (
      organization_id,
      interview_credits_remaining,
      screening_credits_remaining
    )
    values (
      ${organizationId}::uuid,
      ${FREE_TRIAL_INTERVIEW_CREDITS},
      ${FREE_TRIAL_SCREENING_CREDITS}
    )
    on conflict (organization_id) do update
    set updated_at = public.workspace_trial_credits.updated_at
    returning
      organization_id::text,
      interview_credits_remaining,
      screening_credits_remaining
  `)

  const row = rows[0]
  if (!row) {
    throw new ApiError(500, "TRIAL_CREDITS_UNAVAILABLE", "Unable to load free trial credits.")
  }

  return mapTrialCreditRow(row)
}

export async function assertTrialCreditsAvailable(input: {
  organizationId: string
  kind: TrialCreditKind
  amount?: number
}) {
  const amount = Math.max(1, Math.floor(input.amount ?? 1))
  const credits = await getOrCreateTrialCredits(input.organizationId)
  const remaining =
    input.kind === "INTERVIEW" ? credits.interviewCreditsRemaining : credits.screeningCreditsRemaining

  if (remaining < amount) {
    throw new ApiError(402, "FREE_TRIAL_LIMIT_REACHED", FREE_TRIAL_LIMIT_MESSAGE)
  }

  return credits
}

export async function deductTrialCredits(input: {
  organizationId: string
  kind: TrialCreditKind
  amount?: number
}) {
  const amount = Math.max(1, Math.floor(input.amount ?? 1))
  await ensureTrialCreditSchema()

  const rows = input.kind === "INTERVIEW"
    ? await prisma.$queryRaw<TrialCreditRow[]>(Prisma.sql`
        update public.workspace_trial_credits
        set
          interview_credits_remaining = interview_credits_remaining - ${amount},
          updated_at = now()
        where organization_id = ${input.organizationId}::uuid
          and interview_credits_remaining >= ${amount}
        returning
          organization_id::text,
          interview_credits_remaining,
          screening_credits_remaining
      `)
    : await prisma.$queryRaw<TrialCreditRow[]>(Prisma.sql`
        update public.workspace_trial_credits
        set
          screening_credits_remaining = screening_credits_remaining - ${amount},
          updated_at = now()
        where organization_id = ${input.organizationId}::uuid
          and screening_credits_remaining >= ${amount}
        returning
          organization_id::text,
          interview_credits_remaining,
          screening_credits_remaining
      `)

  const row = rows[0]
  if (!row) {
    throw new ApiError(402, "FREE_TRIAL_LIMIT_REACHED", FREE_TRIAL_LIMIT_MESSAGE)
  }

  return mapTrialCreditRow(row)
}
