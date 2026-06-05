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
type TrialCreditUsage = {
  usedInterviewCredits: number
  usedScreeningCredits: number
}
type TrialCreditCacheEntry = {
  value: TrialCreditSnapshot
  expiresAt: number
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TRIAL_CREDIT_DASHBOARD_CACHE_TTL_MS = 0
const trialCreditDashboardCache = new Map<string, TrialCreditCacheEntry>()
let ensureTrialCreditSchemaPromise: Promise<void> | null = null

function invalidateTrialCreditDashboardCache(organizationId: string) {
  trialCreditDashboardCache.delete(organizationId)
}

function normalizeCount(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
}

function mapTrialCreditRow(row: TrialCreditRow, usage?: Partial<TrialCreditUsage>): TrialCreditSnapshot {
  const reconciledInterviewCredits = usage?.usedInterviewCredits === undefined
    ? FREE_TRIAL_INTERVIEW_CREDITS
    : Math.max(0, FREE_TRIAL_INTERVIEW_CREDITS - normalizeCount(usage.usedInterviewCredits))
  const reconciledScreeningCredits = usage?.usedScreeningCredits === undefined
    ? FREE_TRIAL_SCREENING_CREDITS
    : Math.max(0, FREE_TRIAL_SCREENING_CREDITS - normalizeCount(usage.usedScreeningCredits))
  const interviewCreditsRemaining = Math.min(normalizeCount(row.interview_credits_remaining), reconciledInterviewCredits)
  const screeningCreditsRemaining = Math.min(normalizeCount(row.screening_credits_remaining), reconciledScreeningCredits)

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
  const usedScreeningCredits = await getUsedScreeningCredits(organizationId, client)
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

async function reconcileTrialCreditRow(organizationId: string, client: QueryClient = prisma) {
  const usage = await getTrialCreditUsage(organizationId, client)
  const interviewCreditsRemaining = Math.max(0, FREE_TRIAL_INTERVIEW_CREDITS - usage.usedInterviewCredits)
  const screeningCreditsRemaining = Math.max(0, FREE_TRIAL_SCREENING_CREDITS - usage.usedScreeningCredits)

  const rows = await client.$queryRaw<TrialCreditRow[]>(Prisma.sql`
    update public.workspace_trial_credits
    set
      interview_credits_remaining = least(interview_credits_remaining, ${interviewCreditsRemaining}),
      screening_credits_remaining = least(screening_credits_remaining, ${screeningCreditsRemaining}),
      updated_at = case
        when interview_credits_remaining > ${interviewCreditsRemaining}
          or screening_credits_remaining > ${screeningCreditsRemaining}
        then now()
        else updated_at
      end
    where organization_id = ${organizationId}::uuid
    returning
      organization_id::text,
      interview_credits_remaining,
      screening_credits_remaining
  `)

  return {
    row: rows[0] ?? null,
    usage,
  }
}

async function getUsedScreeningCredits(organizationId: string, client: QueryClient = prisma) {
  let usedFromRuns = 0

  if ((await tableExists("screening_runs", client)) && (await columnExists("screening_runs", "organization_id", client))) {
    if (!(await columnExists("screening_runs", "total_candidates", client))) {
      await client.$executeRaw(Prisma.sql`
        alter table public.screening_runs
          add column if not exists total_candidates integer not null default 0
      `)
    }

    const rows = await client.$queryRaw<Array<{ used_screening_credits: number }>>(Prisma.sql`
      with run_usage as (
        select
          sr.id,
          greatest(
            coalesce(sr.total_candidates, 0),
            count(distinct srm.candidate_id)::int,
            count(srm.id)::int
          ) as candidate_count
        from public.screening_runs sr
        left join public.screening_run_matches srm
          on srm.run_id = sr.id
          and srm.organization_id = sr.organization_id
        where sr.organization_id = ${organizationId}::uuid
        group by sr.id, sr.total_candidates
      )
      select coalesce(sum(greatest(candidate_count, 0)), 0)::int as used_screening_credits
      from run_usage
    `)
    usedFromRuns = normalizeCount(rows[0]?.used_screening_credits)
  }

  let usedFromSavedMatches = 0
  if ((await tableExists("candidate_job_matches", client)) && (await columnExists("candidate_job_matches", "organization_id", client))) {
    const rows = await client.$queryRaw<Array<{ used_screening_credits: number }>>(Prisma.sql`
      select count(*)::int as used_screening_credits
      from public.candidate_job_matches
      where organization_id = ${organizationId}::uuid
    `)
    usedFromSavedMatches = normalizeCount(rows[0]?.used_screening_credits)
  }

  return Math.max(usedFromRuns, usedFromSavedMatches)
}

async function reconcileInterviewCreditsFromInterviews(organizationId: string, client: QueryClient = prisma) {
  const usedInterviewCredits = await getUsedInterviewCredits(organizationId, client)
  const reconciledRemaining = Math.max(0, FREE_TRIAL_INTERVIEW_CREDITS - usedInterviewCredits)

  await client.$executeRaw(Prisma.sql`
    update public.workspace_trial_credits
    set
      interview_credits_remaining = least(interview_credits_remaining, ${reconciledRemaining}),
      updated_at = case
        when interview_credits_remaining > ${reconciledRemaining} then now()
        else updated_at
      end
    where organization_id = ${organizationId}::uuid
  `)
}

async function getUsedInterviewCredits(organizationId: string, client: QueryClient = prisma) {
  const interviewRows = await client.$queryRaw<Array<{ used_interview_credits: number }>>(Prisma.sql`
    select count(distinct i.interview_id)::int as used_interview_credits
    from public.interviews i
    where i.organization_id = ${organizationId}::uuid
  `)

  let usedFromInvites = 0
  if ((await tableExists("interview_invites", client)) && (await tableExists("interviews", client))) {
    const inviteRows = await client.$queryRaw<Array<{ used_interview_credits: number }>>(Prisma.sql`
      select count(distinct ii.interview_id)::int as used_interview_credits
      from public.interview_invites ii
      inner join public.interviews i
        on i.interview_id = ii.interview_id
        and i.organization_id = ${organizationId}::uuid
    `)
    usedFromInvites = normalizeCount(inviteRows[0]?.used_interview_credits)
  }

  return Math.max(normalizeCount(interviewRows[0]?.used_interview_credits), usedFromInvites)
}

async function getUsedTrialCreditsFromEvents(organizationId: string, client: QueryClient = prisma): Promise<TrialCreditUsage> {
  if (!(await tableExists("workspace_trial_credit_events", client))) {
    return {
      usedInterviewCredits: 0,
      usedScreeningCredits: 0,
    }
  }

  const rows = await client.$queryRaw<Array<{
    used_interview_credits: number
    used_screening_credits: number
  }>>(Prisma.sql`
    select
      coalesce(sum(amount) filter (where kind = 'INTERVIEW'), 0)::int as used_interview_credits,
      coalesce(sum(amount) filter (where kind = 'SCREENING'), 0)::int as used_screening_credits
    from public.workspace_trial_credit_events
    where organization_id = ${organizationId}::uuid
  `)

  return {
    usedInterviewCredits: normalizeCount(rows[0]?.used_interview_credits),
    usedScreeningCredits: normalizeCount(rows[0]?.used_screening_credits),
  }
}

async function getTrialCreditUsage(organizationId: string, client: QueryClient = prisma): Promise<TrialCreditUsage> {
  const [usedInterviewCredits, usedScreeningCredits, eventUsage] = await Promise.all([
    getUsedInterviewCredits(organizationId, client).catch((error) => {
      console.warn("Trial credit interview usage lookup skipped", error)
      return 0
    }),
    getUsedScreeningCredits(organizationId, client).catch((error) => {
      console.warn("Trial credit screening usage lookup skipped", error)
      return 0
    }),
    getUsedTrialCreditsFromEvents(organizationId, client).catch((error) => {
      console.warn("Trial credit event usage lookup skipped", error)
      return {
        usedInterviewCredits: 0,
        usedScreeningCredits: 0,
      }
    }),
  ])

  return {
    usedInterviewCredits: Math.max(usedInterviewCredits, eventUsage.usedInterviewCredits),
    usedScreeningCredits: Math.max(usedScreeningCredits, eventUsage.usedScreeningCredits),
  }
}

export async function ensureTrialCreditSchema(client: QueryClient = prisma) {
  if (client === prisma && ensureTrialCreditSchemaPromise) {
    return ensureTrialCreditSchemaPromise
  }

  const ensurePromise = (async () => {
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

    await client.$executeRaw(Prisma.sql`
    create table if not exists public.workspace_trial_credit_events (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references public.organizations(organization_id) on delete cascade,
      kind text not null,
      amount integer not null,
      source text,
      source_id text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      constraint workspace_trial_credit_events_kind_check check (kind in ('INTERVIEW', 'SCREENING')),
      constraint workspace_trial_credit_events_amount_positive check (amount > 0)
    )
  `)

    await client.$executeRaw(Prisma.sql`
    create index if not exists workspace_trial_credit_events_org_kind_created_idx
      on public.workspace_trial_credit_events (organization_id, kind, created_at desc)
  `)

    await client.$executeRaw(Prisma.sql`
    create unique index if not exists workspace_trial_credit_events_source_uidx
      on public.workspace_trial_credit_events (organization_id, kind, source, source_id)
      where source_id is not null
  `)
  })()

  if (client !== prisma) {
    return ensurePromise
  }

  ensureTrialCreditSchemaPromise = ensurePromise.catch((error) => {
    ensureTrialCreditSchemaPromise = null
    throw error
  })

  return ensureTrialCreditSchemaPromise
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

  const reconciled = await reconcileTrialCreditRow(organizationId, client)
  const rows = reconciled.row
    ? [reconciled.row]
    : await client.$queryRaw<TrialCreditRow[]>(Prisma.sql`
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

  return mapTrialCreditRow(row, reconciled.usage)
}

export async function getTrialCreditsDashboardSnapshot(organizationId: string, client: QueryClient = prisma) {
  const cached = client === prisma ? trialCreditDashboardCache.get(organizationId) : null
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  try {
    await ensureTrialCreditSchema(client)
    await ensureTrialCreditOrganization(organizationId, client)

    const insertedRows = await client.$queryRaw<TrialCreditRow[]>(Prisma.sql`
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
      on conflict (organization_id) do nothing
      returning
        organization_id::text,
        interview_credits_remaining,
        screening_credits_remaining
    `)

    const rows = insertedRows.length > 0
      ? insertedRows
      : await client.$queryRaw<TrialCreditRow[]>(Prisma.sql`
        select
          organization_id::text,
          interview_credits_remaining,
          screening_credits_remaining
        from public.workspace_trial_credits
        where organization_id = ${organizationId}::uuid
        limit 1
      `)

    const reconciled = await reconcileTrialCreditRow(organizationId, client)
    const reconciledRows = reconciled.row
      ? [reconciled.row]
      : await client.$queryRaw<TrialCreditRow[]>(Prisma.sql`
      select
        organization_id::text,
        interview_credits_remaining,
        screening_credits_remaining
      from public.workspace_trial_credits
      where organization_id = ${organizationId}::uuid
      limit 1
    `)

    const row = reconciledRows[0] ?? rows[0]
    const snapshot = row
      ? mapTrialCreditRow(row, reconciled.usage)
      : createInitialTrialCreditSnapshot(organizationId)

    if (client === prisma) {
      trialCreditDashboardCache.set(organizationId, {
        value: snapshot,
        expiresAt: Date.now() + TRIAL_CREDIT_DASHBOARD_CACHE_TTL_MS,
      })
    }

    return snapshot
  } catch (error) {
    console.warn("Trial credit dashboard snapshot used initial fallback", error)
    return createInitialTrialCreditSnapshot(organizationId)
  }
}

export async function assertTrialCreditsAvailable(input: {
  organizationId: string
  kind: TrialCreditKind
  amount?: number
}) {
  const amount = Math.max(1, Math.floor(input.amount ?? 1))
  const credits = await getOrCreateTrialCredits(input.organizationId).catch((error) => {
    console.error("Trial credit availability check failed", error)
    throw new ApiError(503, "TRIAL_CREDITS_UNAVAILABLE", "Unable to verify free trial credits. Please try again.")
  })

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
  source?: string | null
  sourceId?: string | null
}) {
  const amount = Math.max(1, Math.floor(input.amount ?? 1))
  const creditsBeforeDeduction = await getOrCreateTrialCredits(input.organizationId).catch((error) => {
    console.error("Trial credit deduction preflight failed", error)
    throw new ApiError(503, "TRIAL_CREDITS_UNAVAILABLE", "Unable to update free trial credits. Please try again.")
  })

  const remainingBeforeDeduction =
    input.kind === "INTERVIEW"
      ? creditsBeforeDeduction.interviewCreditsRemaining
      : creditsBeforeDeduction.screeningCreditsRemaining

  if (remainingBeforeDeduction < amount) {
    throw new ApiError(402, "FREE_TRIAL_LIMIT_REACHED", FREE_TRIAL_LIMIT_MESSAGE)
  }

  try {
    const row = await prisma.$transaction(async (tx) => {
      const rows = input.kind === "INTERVIEW"
        ? await tx.$queryRaw<TrialCreditRow[]>(Prisma.sql`
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
        : await tx.$queryRaw<TrialCreditRow[]>(Prisma.sql`
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

      const updatedRow = rows[0]
      if (!updatedRow) {
        throw new ApiError(402, "FREE_TRIAL_LIMIT_REACHED", FREE_TRIAL_LIMIT_MESSAGE)
      }

      await tx.$executeRaw(Prisma.sql`
        insert into public.workspace_trial_credit_events (
          organization_id,
          kind,
          amount,
          source,
          source_id,
          metadata
        )
        values (
          ${input.organizationId}::uuid,
          ${input.kind},
          ${amount},
          ${input.source ?? "deduction"},
          ${input.sourceId ?? null},
          ${JSON.stringify({ remainingAfter: {
            interviewCreditsRemaining: updatedRow.interview_credits_remaining,
            screeningCreditsRemaining: updatedRow.screening_credits_remaining,
          } })}::jsonb
        )
      `)

      return updatedRow
    })

    const usage = await getTrialCreditUsage(input.organizationId)
    const snapshot = mapTrialCreditRow(row, usage)
    invalidateTrialCreditDashboardCache(input.organizationId)
    return snapshot
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }

    console.error("Trial credit table update failed", error)
    invalidateTrialCreditDashboardCache(input.organizationId)
    throw new ApiError(503, "TRIAL_CREDITS_UPDATE_FAILED", "Unable to update free trial credits. Please try again.")
  }
}
