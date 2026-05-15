import { Prisma } from "@prisma/client"

import { deriveDashboardState } from "@/lib/dashboard/dashboard-state-engine"
import { prisma } from "@/lib/server/prisma"

export type DashboardWorkflowSnapshot = {
  pipeline: {
    pending: number
    inProgress: number
    completed: number
    flagged: number
  }
  workflowMetrics: {
    jobs: number
    invites: number
    screeningRuns: number
    shortlistedCandidates: number
    screeningStarted: boolean
    screeningCompleted: boolean
    interviewsRunning: number
    completedInterviews: number
    pendingReports: number
    reviewedReports: number
    decisionsPending: number
  }
  dashboardState: ReturnType<typeof deriveDashboardState>
}

const tableExistenceCache = new Map<string, boolean>()

async function tableExists(tableName: string) {
  const cached = tableExistenceCache.get(tableName)
  if (cached !== undefined) {
    return cached
  }

  const rows = await prisma.$queryRaw<Array<{ regclass: string | null }>>`
    select to_regclass(${`public.${tableName}`})::text as regclass
  `
  const exists = Boolean(rows[0]?.regclass)
  tableExistenceCache.set(tableName, exists)
  return exists
}

async function getScreeningWorkflowMetrics(organizationId: string) {
  if (!(await tableExists("screening_runs"))) {
    return {
      screeningRuns: 0,
      shortlistedCandidates: 0,
    }
  }

  const rows = await prisma.$queryRaw<Array<{ screening_runs: number; shortlisted_candidates: number }>>`
    select
      count(*)::int as screening_runs,
      coalesce(sum(strong_fit_count), 0)::int as shortlisted_candidates
    from public.screening_runs
    where organization_id = ${organizationId}::uuid
  `

  return {
    screeningRuns: Number(rows[0]?.screening_runs ?? 0),
    shortlistedCandidates: Number(rows[0]?.shortlisted_candidates ?? 0),
  }
}

type InterviewWorkflowRow = {
  pending: number
  in_progress: number
  completed: number
  flagged: number
  pending_reports: number
  reviewed_reports: number
  decisions_pending: number
}

async function getInterviewWorkflowMetrics(organizationId: string) {
  const rows = await prisma.$queryRaw<InterviewWorkflowRow[]>(Prisma.sql`
    with latest_attempts as (
      select distinct on (ia.interview_id)
        ia.attempt_id,
        ia.interview_id,
        ia.status,
        ia.started_at,
        ia.ended_at
      from public.interview_attempts ia
      inner join public.interviews i on i.interview_id = ia.interview_id
      where i.organization_id = ${organizationId}::uuid
      order by ia.interview_id, ia.started_at desc nulls last
    ),
    base as (
      select
        i.interview_id,
        i.status as interview_status,
        la.attempt_id,
        la.status as attempt_status,
        la.started_at,
        la.ended_at,
        ie.evaluation_id,
        ie.decision
      from public.interviews i
      left join latest_attempts la on la.interview_id = i.interview_id
      left join public.interview_evaluations ie on ie.attempt_id = la.attempt_id
      where i.organization_id = ${organizationId}::uuid
    )
    select
      count(*) filter (
        where attempt_id is null and upper(coalesce(interview_status, '')) in ('READY', 'PENDING', 'SCHEDULED')
      )::int as pending,
      count(*) filter (
        where started_at is not null
          and ended_at is null
          and upper(coalesce(attempt_status, interview_status, '')) not in ('COMPLETED', 'SUBMITTED', 'EVALUATED', 'INTERRUPTED', 'FAILED', 'PREPARATION_FAILED')
      )::int as in_progress,
      count(*) filter (
        where upper(coalesce(interview_status, attempt_status, '')) in ('COMPLETED', 'SUBMITTED', 'EVALUATED')
          or ended_at is not null
      )::int as completed,
      count(*) filter (
        where upper(coalesce(interview_status, attempt_status, '')) in ('FLAGGED', 'FAILED', 'PREPARATION_FAILED', 'INTERRUPTED', 'RECOVERY_ALLOWED')
      )::int as flagged,
      count(*) filter (
        where (upper(coalesce(interview_status, attempt_status, '')) in ('COMPLETED', 'SUBMITTED', 'EVALUATED') or ended_at is not null)
          and (evaluation_id is null or decision is null)
      )::int as pending_reports,
      count(*) filter (
        where (upper(coalesce(interview_status, attempt_status, '')) in ('COMPLETED', 'SUBMITTED', 'EVALUATED') or ended_at is not null)
          and decision is not null
      )::int as reviewed_reports,
      count(*) filter (
        where (upper(coalesce(interview_status, attempt_status, '')) in ('COMPLETED', 'SUBMITTED', 'EVALUATED') or ended_at is not null)
          and decision is not null
      )::int as decisions_pending
    from base
  `)

  const row = rows[0]

  return {
    pending: Number(row?.pending ?? 0),
    inProgress: Number(row?.in_progress ?? 0),
    completed: Number(row?.completed ?? 0),
    flagged: Number(row?.flagged ?? 0),
    pendingReports: Number(row?.pending_reports ?? 0),
    reviewedReports: Number(row?.reviewed_reports ?? 0),
    decisionsPending: Number(row?.decisions_pending ?? 0),
  }
}

export async function getDashboardWorkflowSnapshot(organizationId: string): Promise<DashboardWorkflowSnapshot> {
  const [jobs, invites, screeningMetrics, interviewMetrics] = await Promise.all([
    prisma.jobPosition.count({
      where: {
        organizationId,
      },
    }),
    prisma.interviewInvite.count({
      where: {
        interview: {
          organizationId,
        },
      },
    }),
    getScreeningWorkflowMetrics(organizationId),
    getInterviewWorkflowMetrics(organizationId),
  ])

  const workflowMetrics = {
    jobs,
    invites,
    screeningRuns: screeningMetrics.screeningRuns,
    shortlistedCandidates: screeningMetrics.shortlistedCandidates,
    screeningStarted: screeningMetrics.screeningRuns > 0,
    screeningCompleted: screeningMetrics.screeningRuns > 0 && screeningMetrics.shortlistedCandidates > 0,
    interviewsRunning: interviewMetrics.inProgress,
    completedInterviews: interviewMetrics.completed,
    pendingReports: interviewMetrics.pendingReports,
    reviewedReports: interviewMetrics.reviewedReports,
    decisionsPending: interviewMetrics.decisionsPending,
  }

  const dashboardState = deriveDashboardState({
    jobs_count: jobs,
    veris_screening_count: screeningMetrics.screeningRuns,
    interview_links_count: invites,
    interviews_count: interviewMetrics.completed + interviewMetrics.inProgress,
    pending_reviews_count: interviewMetrics.pendingReports + interviewMetrics.decisionsPending,
  })

  return {
    pipeline: {
      pending: interviewMetrics.pending,
      inProgress: interviewMetrics.inProgress,
      completed: interviewMetrics.completed,
      flagged: interviewMetrics.flagged,
    },
    workflowMetrics,
    dashboardState,
  }
}
