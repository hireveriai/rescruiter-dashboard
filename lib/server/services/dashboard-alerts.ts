import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"

export type DashboardAlert = {
  id: string
  type: "INTERVIEW_STARTED" | "INTERVIEW_COMPLETED" | "INTERVIEW_INTERRUPTED" | "INTERVIEW_FAILED"
  title: string
  message: string
  tone: "info" | "success" | "warning" | "danger"
  candidateName: string
  jobTitle: string
  occurredAt: string
}

type AlertRow = {
  alert_id: string
  alert_type: DashboardAlert["type"]
  candidate_name: string | null
  job_title: string | null
  attempt_status: string | null
  interview_status: string | null
  started_at: Date | string | null
  ended_at: Date | string | null
  occurred_at: Date | string | null
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase()
}

function toIso(value: Date | string | null | undefined) {
  if (!value) {
    return new Date().toISOString()
  }

  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

function buildAlert(row: AlertRow): DashboardAlert {
  const candidateName = row.candidate_name || "Candidate"
  const jobTitle = row.job_title || "Interview"
  const type = row.alert_type

  if (type === "INTERVIEW_COMPLETED") {
    return {
      id: row.alert_id,
      type,
      title: "Interview completed",
      message: `${candidateName} completed ${jobTitle}. Review the report when ready.`,
      tone: "success",
      candidateName,
      jobTitle,
      occurredAt: toIso(row.occurred_at),
    }
  }

  if (type === "INTERVIEW_INTERRUPTED") {
    return {
      id: row.alert_id,
      type,
      title: "Interview interrupted",
      message: `${candidateName} has an interrupted interview. Check recovery and forensic logs.`,
      tone: "warning",
      candidateName,
      jobTitle,
      occurredAt: toIso(row.occurred_at),
    }
  }

  if (type === "INTERVIEW_FAILED") {
    return {
      id: row.alert_id,
      type,
      title: "Interview needs attention",
      message: `${candidateName}'s interview workflow reported a failure state.`,
      tone: "danger",
      candidateName,
      jobTitle,
      occurredAt: toIso(row.occurred_at),
    }
  }

  return {
    id: row.alert_id,
    type: "INTERVIEW_STARTED",
    title: "Interview started",
    message: `${candidateName} started ${jobTitle}. Live interview telemetry is active.`,
    tone: "info",
    candidateName,
    jobTitle,
    occurredAt: toIso(row.occurred_at),
  }
}

export async function getDashboardAlerts(organizationId: string, limit = 8): Promise<DashboardAlert[]> {
  const rows = await prisma.$queryRaw<AlertRow[]>(Prisma.sql`
    with latest_attempts as (
      select distinct on (ia.interview_id)
        ia.attempt_id,
        ia.interview_id,
        ia.status as attempt_status,
        ia.started_at,
        ia.ended_at,
        ia.interruption_reason
      from public.interview_attempts ia
      order by ia.interview_id, ia.started_at desc
    ),
    alert_source as (
      select
        i.interview_id::text || ':' || coalesce(la.attempt_id::text, i.status, 'pending') as alert_id,
        case
          when upper(coalesce(la.attempt_status, i.status, '')) in ('INTERRUPTED', 'RECOVERY_ALLOWED') then 'INTERVIEW_INTERRUPTED'
          when upper(coalesce(i.status, la.attempt_status, '')) in ('FAILED', 'PREPARATION_FAILED') then 'INTERVIEW_FAILED'
          when upper(coalesce(i.status, la.attempt_status, '')) in ('COMPLETED', 'SUBMITTED', 'EVALUATED') or la.ended_at is not null then 'INTERVIEW_COMPLETED'
          when la.started_at is not null then 'INTERVIEW_STARTED'
          else null
        end as alert_type,
        c.full_name as candidate_name,
        jp.job_title,
        la.attempt_status,
        i.status as interview_status,
        la.started_at,
        la.ended_at,
        coalesce(la.ended_at, la.started_at, i.created_at) as occurred_at
      from public.interviews i
      left join latest_attempts la on la.interview_id = i.interview_id
      left join public.candidates c on c.candidate_id = i.candidate_id
      left join public.job_positions jp on jp.job_id = i.job_id
      where i.organization_id = ${organizationId}::uuid
    )
    select *
    from alert_source
    where alert_type is not null
    order by occurred_at desc nulls last
    limit ${Math.max(1, Math.min(limit, 25))}
  `)

  return rows
    .filter((row) => Boolean(row.alert_type))
    .map((row) => ({
      ...row,
      alert_type: normalizeStatus(row.alert_type) as DashboardAlert["type"],
    }))
    .map(buildAlert)
}
