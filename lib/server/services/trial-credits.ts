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
    `).catch((error) => {
      console.warn("Trial credit balance index setup skipped", error)
    })

    await ensureTrialCreditOptionalSchema(client)
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

async function ensureTrialCreditOptionalSchema(client: QueryClient = prisma) {
  await client.$executeRawUnsafe(`
  create or replace function public.ensure_workspace_trial_credits()
  returns trigger
  language plpgsql
  as $$
  begin
    insert into public.workspace_trial_credits (
      organization_id,
      interview_credits_remaining,
      screening_credits_remaining
    )
    values (
      new.organization_id,
      ${FREE_TRIAL_INTERVIEW_CREDITS},
      ${FREE_TRIAL_SCREENING_CREDITS}
    )
    on conflict (organization_id) do nothing;

    return new;
  end;
  $$;
`).catch((error) => {
    console.warn("Trial credit organization trigger function setup skipped", error)
  })

  await client.$executeRawUnsafe(`
  drop trigger if exists organizations_seed_workspace_trial_credits on public.organizations;
  create trigger organizations_seed_workspace_trial_credits
    after insert on public.organizations
    for each row
    execute function public.ensure_workspace_trial_credits();
`).catch((error) => {
    console.warn("Trial credit organization trigger setup skipped", error)
  })

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
`).catch((error) => {
    console.warn("Trial credit audit table setup skipped", error)
  })

  await client.$executeRaw(Prisma.sql`
    create index if not exists workspace_trial_credit_events_org_kind_created_idx
      on public.workspace_trial_credit_events (organization_id, kind, created_at desc)
  `).catch((error) => {
    console.warn("Trial credit audit index setup skipped", error)
  })

  await client.$executeRaw(Prisma.sql`
    create unique index if not exists workspace_trial_credit_events_source_uidx
      on public.workspace_trial_credit_events (organization_id, kind, source, source_id)
      where source_id is not null
  `).catch((error) => {
    console.warn("Trial credit audit unique index setup skipped", error)
  })
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

  const row = rows[0]
  if (!row) {
    throw new ApiError(500, "TRIAL_CREDITS_UNAVAILABLE", "Unable to load free trial credits.")
  }

  return mapTrialCreditRow(row)
}

export async function getTrialCreditsDashboardSnapshot(organizationId: string, client: QueryClient = prisma) {
  const cached = client === prisma ? trialCreditDashboardCache.get(organizationId) : null
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const snapshot = await getOrCreateTrialCredits(organizationId, client)

  if (client === prisma) {
    trialCreditDashboardCache.set(organizationId, {
      value: snapshot,
      expiresAt: Date.now() + TRIAL_CREDIT_DASHBOARD_CACHE_TTL_MS,
    })
  }

  return snapshot
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
    const label = input.kind === "INTERVIEW" ? "interview" : "screening"
    throw new ApiError(
      402,
      "FREE_TRIAL_LIMIT_REACHED",
      remaining <= 0
        ? FREE_TRIAL_LIMIT_MESSAGE
        : `This action needs ${amount} ${label} credit${amount === 1 ? "" : "s"}, but your workspace has ${remaining} left. Reduce the selection or upgrade your workspace.`
    )
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
    const label = input.kind === "INTERVIEW" ? "interview" : "screening"
    throw new ApiError(
      402,
      "FREE_TRIAL_LIMIT_REACHED",
      remainingBeforeDeduction <= 0
        ? FREE_TRIAL_LIMIT_MESSAGE
        : `This action needs ${amount} ${label} credit${amount === 1 ? "" : "s"}, but your workspace has ${remainingBeforeDeduction} left. Reduce the selection or upgrade your workspace.`
    )
  }

  try {
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

    await recordTrialCreditEvent({
      organizationId: input.organizationId,
      kind: input.kind,
      amount,
      source: input.source ?? "deduction",
      sourceId: input.sourceId ?? null,
      remainingAfter: row,
    })

    const snapshot = mapTrialCreditRow(row)
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

async function recordTrialCreditEvent(input: {
  organizationId: string
  kind: TrialCreditKind
  amount: number
  source: string
  sourceId: string | null
  remainingAfter: TrialCreditRow
}) {
  await prisma.$executeRaw(Prisma.sql`
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
      ${input.amount},
      ${input.source},
      ${input.sourceId},
      ${JSON.stringify({ remainingAfter: {
        interviewCreditsRemaining: input.remainingAfter.interview_credits_remaining,
        screeningCreditsRemaining: input.remainingAfter.screening_credits_remaining,
      } })}::jsonb
    )
  `).catch((error) => {
    console.warn("Trial credit audit event write skipped", error)
  })
}
