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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

export function createInitialTrialCreditSnapshot(organizationId: string): TrialCreditSnapshot {
  return {
    organizationId,
    interviewCreditsRemaining: FREE_TRIAL_INTERVIEW_CREDITS,
    screeningCreditsRemaining: FREE_TRIAL_SCREENING_CREDITS,
    canSendInterview: true,
    canStartScreening: true,
    upgradeMessage: FREE_TRIAL_LIMIT_MESSAGE,
  }
}

async function tableExists(tableName: string, client: QueryClient = prisma) {
  const rows = await client.$queryRaw<Array<{ regclass: string | null }>>(Prisma.sql`
    select to_regclass(${`public.${tableName}`})::text as regclass
  `)

  return Boolean(rows[0]?.regclass)
}

async function columnExists(tableName: string, columnName: string, client: QueryClient = prisma) {
  const rows = await client.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
        and column_name = ${columnName}
    ) as exists
  `)

  return Boolean(rows[0]?.exists)
}

async function reconcileScreeningCreditsFromRuns(organizationId: string, client: QueryClient = prisma) {
  if (!(await tableExists("screening_runs", client))) {
    return
  }

  if (!(await columnExists("screening_runs", "organization_id", client))) {
    return
  }

  if (!(await columnExists("screening_runs", "total_candidates", client))) {
    await client.$executeRaw(Prisma.sql`
      alter table public.screening_runs
        add column if not exists total_candidates integer not null default 0
    `)
  }

  const rows = await client.$queryRaw<Array<{ used_screening_credits: number }>>(Prisma.sql`
    select coalesce(sum(greatest(coalesce(total_candidates, 0), 0)), 0)::int as used_screening_credits
    from public.screening_runs
    where organization_id = ${organizationId}::uuid
  `)
  const usedScreeningCredits = normalizeCount(rows[0]?.used_screening_credits)
  const reconciledRemaining = Math.max(0, FREE_TRIAL_SCREENING_CREDITS - usedScreeningCredits)

  await client.$executeRaw(Prisma.sql`
    update public.workspace_trial_credits
    set
      screening_credits_remaining = least(screening_credits_remaining, ${reconciledRemaining}),
      updated_at = case
        when screening_credits_remaining > ${reconciledRemaining} then now()
        else updated_at
      end
    where organization_id = ${organizationId}::uuid
  `)
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
    alter table public.workspace_trial_credits
      add column if not exists interview_credits_remaining integer not null default ${FREE_TRIAL_INTERVIEW_CREDITS},
      add column if not exists screening_credits_remaining integer not null default ${FREE_TRIAL_SCREENING_CREDITS},
      add column if not exists created_at timestamptz not null default now(),
      add column if not exists updated_at timestamptz not null default now()
  `)

  await client.$executeRaw(Prisma.sql`
    create index if not exists workspace_trial_credits_updated_at_idx
      on public.workspace_trial_credits (updated_at desc)
  `)
}

export async function ensureTrialCreditOrganization(organizationId: string, client: QueryClient = prisma) {
  if (!UUID_REGEX.test(organizationId)) {
    throw new ApiError(400, "INVALID_ORGANIZATION_ID", "Invalid recruiter workspace.")
  }

  try {
    await client.$executeRaw(Prisma.sql`
      insert into public.organizations (
        organization_id,
        organization_name,
        is_active,
        created_at
      )
      values (
        ${organizationId}::uuid,
        'Recruiter Workspace',
        true,
        now()
      )
      on conflict (organization_id) do nothing
    `)
  } catch (error) {
    console.warn("Trial credit organization bootstrap skipped", error)
  }

  const rows = await client.$queryRaw<Array<{ exists: boolean }>>(Prisma.sql`
    select exists (
      select 1
      from public.organizations
      where organization_id = ${organizationId}::uuid
    ) as exists
  `)

  if (!rows[0]?.exists) {
    throw new ApiError(404, "RECRUITER_WORKSPACE_NOT_FOUND", "Recruiter workspace was not found.")
  }
}

export async function getOrCreateTrialCredits(organizationId: string, client: QueryClient = prisma) {
  await ensureTrialCreditSchema(client)
  await ensureTrialCreditOrganization(organizationId, client)

  await client.$executeRaw(Prisma.sql`
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
  `)

  try {
    await reconcileScreeningCreditsFromRuns(organizationId, client)
  } catch (error) {
    console.warn("Trial credit screening reconciliation skipped", error)
  }

  const rows = await client.$queryRaw<TrialCreditRow[]>(Prisma.sql`
    select
      organization_id::text,
      interview_credits_remaining,
      screening_credits_remaining
    from public.workspace_trial_credits
    where organization_id = ${organizationId}::uuid
    limit 1
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
  await getOrCreateTrialCredits(input.organizationId)

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
