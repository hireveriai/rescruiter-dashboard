import { getInterviewAppUrl } from "@/lib/server/interview-url"
import { prisma } from "@/lib/server/prisma"
import { deriveInterviewStatus, isInviteUsable } from "@/lib/server/services/interview-status"
import { ensureInterviewRecoverySchema } from "@/lib/server/services/interview-recovery"
import { finalizeStaleInterviewAttempts } from "@/lib/server/services/interview-stale-finalizer"
import { ensureRecruiterDecisionsTable } from "@/lib/server/services/recruiter-decisions"

type DashboardPipelineOptions = {
  organizationId: string
  limit?: number | "all"
  finalizeStale?: boolean
  ensureRecoverySchema?: boolean
}

type DashboardPipelineItem = {
  inviteId: string
  link: string
  candidateName: string
  jobTitle: string
  accessType: string
  startTime: Date | string | null
  endTime: Date | string | null
  expiresAt: Date | string | null
  createdAt: Date | string | null
  interviewId: string
  status: string | null
  questionStatus: string | null
  emailStatus: string | null
  failureReason: string | null
  lastError: string | null
  recovery?: {
    available: boolean
    reason: string | null
    completionPercentage: number
    attemptId: string
    timerRemainingSeconds: number | null
  } | null
}

type DashboardPipelineData = {
  pipeline: {
    pending: number
    inProgress: number
    completed: number
    flagged: number
    reviewed: number
    reviewRequired: number
  }
  pendingInterviews: DashboardPipelineItem[]
  pendingTotal: number
}

type PipelineRow = {
  interview_id: string
  interview_status: string | null
  question_status: string | null
  email_status: string | null
  latest_attempt_id: string | null
  latest_attempt_status: string | null
  latest_attempt_started_at: Date | string | null
  latest_attempt_ended_at: Date | string | null
  latest_invite_id: string | null
  latest_invite_token: string | null
  latest_invite_access_type: string | null
  latest_invite_start_time: Date | string | null
  latest_invite_end_time: Date | string | null
  latest_invite_expires_at: Date | string | null
  latest_invite_created_at: Date | string | null
  latest_invite_status: string | null
  latest_invite_used_at: Date | string | null
  candidate_name: string | null
  job_title: string | null
  failure_reason: string | null
  last_error: string | null
  created_at: Date | string
  max_attempts: number | null
  recovery_allowed: boolean | null
  recovery_used: boolean | null
  recovery_attempt_number: number | null
  interruption_reason: string | null
  completion_percentage: string | number | null
  timer_remaining_seconds: number | null
  recruiter_decision_status: string | null
}

let recoverySchemaReady: Promise<void> | null = null

function ensureRecoverySchemaOnce() {
  if (!recoverySchemaReady) {
    recoverySchemaReady = ensureInterviewRecoverySchema().catch((error) => {
      recoverySchemaReady = null
      throw error
    })
  }

  return recoverySchemaReady
}

function getRecovery(row: PipelineRow) {
  if (!row.latest_attempt_id || !["INTERRUPTED", "RECOVERY_ALLOWED"].includes(String(row.latest_attempt_status ?? "").toUpperCase())) {
    return null
  }

  const completionRaw = Number(row.completion_percentage ?? 0)
  const completion = completionRaw > 1 ? completionRaw : completionRaw * 100

  return {
    available:
      Boolean(row.recovery_allowed) &&
      !row.recovery_used &&
      Number(row.recovery_attempt_number ?? 0) < Math.max(row.max_attempts ?? 2, 1),
    reason: row.interruption_reason,
    completionPercentage: Math.round(completion),
    attemptId: row.latest_attempt_id,
    timerRemainingSeconds: row.timer_remaining_seconds,
  }
}

function getDisplayStatus(row: PipelineRow) {
  return deriveInterviewStatus({
    interviewStatus: row.interview_status,
    questionStatus: row.question_status,
    emailStatus: row.email_status,
    latestAttempt: row.latest_attempt_id
      ? {
          attemptId: row.latest_attempt_id,
          endedAt: row.latest_attempt_ended_at,
          status: row.latest_attempt_status,
        }
      : null,
    latestInvite: row.latest_invite_id
      ? {
          expiresAt: row.latest_invite_expires_at,
          status: row.latest_invite_status,
          usedAt: row.latest_invite_used_at,
        }
      : null,
  })
}

function isPendingQueueRow(row: PipelineRow, displayStatus: string, recovery: ReturnType<typeof getRecovery>) {
  const normalizedInterviewStatus = String(row.interview_status ?? "").toUpperCase()
  const normalizedDisplayStatus = String(displayStatus).toUpperCase()

  if (recovery || normalizedDisplayStatus === "PREPARATION_FAILED") {
    return true
  }

  return (
    normalizedInterviewStatus === "READY" &&
    Boolean(row.latest_invite_id) &&
    isInviteUsable({
      status: row.latest_invite_status,
      expiresAt: row.latest_invite_expires_at,
      usedAt: row.latest_invite_used_at,
    })
  )
}

function buildPendingItem(row: PipelineRow, appUrl: string, displayStatus: string, recovery: ReturnType<typeof getRecovery>): DashboardPipelineItem {
  const normalizedEmailStatus = String(row.email_status ?? "").toUpperCase()
  const normalizedDisplayStatus = String(displayStatus).toUpperCase()
  const status = recovery
    ? "INTERRUPTED"
    : normalizedDisplayStatus === "PREPARATION_FAILED"
      ? "PREPARATION_FAILED"
      : normalizedEmailStatus === "FAILED"
        ? "EMAIL_FAILED"
        : normalizedEmailStatus === "SENDING"
          ? "SENDING_EMAIL"
          : "READY"

  return {
    inviteId: row.latest_invite_id ?? row.latest_attempt_id ?? row.interview_id,
    link: row.latest_invite_token ? `${appUrl}/interview/${row.latest_invite_token}` : "",
    interviewId: row.interview_id,
    candidateName: row.candidate_name ?? "-",
    jobTitle: row.job_title ?? "-",
    accessType: recovery ? "RECOVERY" : row.latest_invite_access_type ?? "FLEXIBLE",
    startTime: row.latest_invite_start_time ?? null,
    endTime: row.latest_invite_end_time ?? null,
    expiresAt: row.latest_invite_expires_at ?? null,
    createdAt: row.latest_invite_created_at ?? row.created_at,
    status,
    questionStatus: row.question_status ?? null,
    emailStatus: row.email_status ?? null,
    failureReason: row.failure_reason ?? null,
    lastError: row.last_error ?? null,
    recovery,
  }
}

export async function getDashboardPipelineData(
  options: DashboardPipelineOptions
): Promise<DashboardPipelineData> {
  if (options.ensureRecoverySchema !== false) {
    await ensureRecoverySchemaOnce()
  }
  if (options.finalizeStale !== false) {
    await finalizeStaleInterviewAttempts(options.organizationId)
  }
  await ensureRecruiterDecisionsTable()
  const appUrl = getInterviewAppUrl().replace(/\/$/, "")
  const take = options.limit === "all" || options.limit === undefined ? undefined : options.limit

  const rows = await prisma.$queryRaw<PipelineRow[]>`
    select
      i.interview_id::text,
      i.status as interview_status,
      i.question_status,
      i.email_status,
      i.failure_reason,
      i.last_error,
      i.created_at,
      i.max_attempts,
      i.recovery_allowed,
      i.recovery_used,
      c.full_name as candidate_name,
      jp.job_title,
      inv.invite_id::text as latest_invite_id,
      inv.token as latest_invite_token,
      inv.access_type as latest_invite_access_type,
      inv.start_time as latest_invite_start_time,
      inv.end_time as latest_invite_end_time,
      inv.expires_at as latest_invite_expires_at,
      inv.created_at as latest_invite_created_at,
      inv.status as latest_invite_status,
      inv.used_at as latest_invite_used_at,
      ia.attempt_id::text as latest_attempt_id,
      ia.status as latest_attempt_status,
      ia.started_at as latest_attempt_started_at,
      ia.ended_at as latest_attempt_ended_at,
      ia.attempt_number as recovery_attempt_number,
      ia.interruption_reason,
      ia.completion_percentage,
      ia.timer_remaining_seconds,
      rd.status as recruiter_decision_status
    from public.interviews i
    left join public.candidates c on c.candidate_id = i.candidate_id
    left join public.job_positions jp on jp.job_id = i.job_id
    left join lateral (
      select *
      from public.interview_invites latest_invite
      where latest_invite.interview_id = i.interview_id
      order by latest_invite.created_at desc
      limit 1
    ) inv on true
    left join lateral (
      select *
      from public.interview_attempts latest
      where latest.interview_id = i.interview_id
      order by latest.attempt_number desc, latest.started_at desc
      limit 1
    ) ia on true
    left join public.candidate_recruiter_decisions rd
      on rd.organization_id = i.organization_id
      and rd.candidate_id = i.candidate_id
      and rd.interview_id = i.interview_id
    where i.organization_id = ${options.organizationId}::uuid
    order by i.created_at desc
  `

  const pendingInterviews: DashboardPipelineItem[] = []
  let pending = 0
  let inProgress = 0
  let completed = 0
  let flagged = 0
  let reviewed = 0
  let reviewRequired = 0

  rows.forEach((row) => {
    const displayStatus = getDisplayStatus(row)
    const normalizedDisplayStatus = String(displayStatus).toUpperCase()
    const recovery = getRecovery(row)

    if (normalizedDisplayStatus === "FLAGGED") {
      flagged += 1
      return
    }

    if (recovery) {
      pending += 1
      if (!take || pendingInterviews.length < take) {
        pendingInterviews.push(buildPendingItem(row, appUrl, displayStatus, recovery))
      }
      return
    }

    if (normalizedDisplayStatus === "PREPARATION_FAILED") {
      pending += 1
      flagged += 1
      if (!take || pendingInterviews.length < take) {
        pendingInterviews.push(buildPendingItem(row, appUrl, displayStatus, null))
      }
      return
    }

    if (normalizedDisplayStatus === "COMPLETED") {
      completed += 1
      if (row.recruiter_decision_status) {
        reviewed += 1
      } else {
        reviewRequired += 1
      }
      return
    }

    if (normalizedDisplayStatus === "IN_PROGRESS") {
      inProgress += 1
      return
    }

    if (isPendingQueueRow(row, displayStatus, recovery)) {
      pending += 1
      if (!take || pendingInterviews.length < take) {
        pendingInterviews.push(buildPendingItem(row, appUrl, displayStatus, null))
      }
    }
  })

  return {
    pipeline: {
      pending,
      inProgress,
      completed,
      flagged,
      reviewed,
      reviewRequired,
    },
    pendingInterviews,
    pendingTotal: pending,
  }
}
