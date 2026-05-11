import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { prisma } from "@/lib/server/prisma"
import { getCandidatesDashboard } from "@/lib/server/services/dashboard.service"
import { getDashboardPipelineData } from "@/lib/server/services/dashboard-pipeline"
import { getDashboardRecordings } from "@/lib/server/services/dashboard-recordings"
import { getRecruiterProfile } from "@/lib/server/services/recruiter-profile"
import { getVerisSummaryCards, type VerisSummaryCard } from "@/lib/server/services/reports.service"

type OverviewPayload = {
  profile: Awaited<ReturnType<typeof getRecruiterProfile>>
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
    pendingReports: number
    decisionsPending: number
  }
  pendingInterviews: Array<Record<string, unknown>>
  recordedInterviews: Array<Record<string, unknown>>
  candidates: Awaited<ReturnType<typeof getCandidatesDashboard>>
  veris: VerisSummaryCard[]
}

type CacheEntry = {
  value: OverviewPayload
  expiresAt: number
}

const CACHE_TTL_MS = 5000
const CACHE_MAX = 50
const overviewCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<OverviewPayload>>()

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = ${tableName}
    ) as exists
  `

  return Boolean(rows[0]?.exists)
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

async function getReportAndDecisionMetrics(organizationId: string) {
  const rows = await prisma.$queryRaw<Array<{ pending_reports: number; decisions_pending: number }>>`
    with latest_attempts as (
      select distinct on (ia.interview_id)
        ia.attempt_id,
        ia.interview_id,
        ia.status,
        ia.ended_at
      from public.interview_attempts ia
      inner join public.interviews i on i.interview_id = ia.interview_id
      where i.organization_id = ${organizationId}::uuid
      order by ia.interview_id, ia.started_at desc
    )
    select
      count(*) filter (
        where (upper(coalesce(la.status, '')) in ('COMPLETED', 'SUBMITTED', 'EVALUATED') or la.ended_at is not null)
          and (ie.evaluation_id is null or ie.decision is null)
      )::int as pending_reports,
      count(*) filter (
        where (upper(coalesce(la.status, '')) in ('COMPLETED', 'SUBMITTED', 'EVALUATED') or la.ended_at is not null)
          and ie.decision is not null
      )::int as decisions_pending
    from latest_attempts la
    left join public.interview_evaluations ie on ie.attempt_id = la.attempt_id
  `

  return {
    pendingReports: Number(rows[0]?.pending_reports ?? 0),
    decisionsPending: Number(rows[0]?.decisions_pending ?? 0),
  }
}

async function buildOverview(
  auth: Awaited<ReturnType<typeof getRecruiterRequestContext>>
): Promise<OverviewPayload> {
  const [profile, veris, candidates, recordedInterviews] = await Promise.all([
    getRecruiterProfile(auth),
    getVerisSummaryCards(auth.organizationId, 6),
    getCandidatesDashboard({
      organizationId: auth.organizationId,
      limit: 5,
    }),
    getDashboardRecordings(auth.organizationId),
  ])
  const pipelineData = await getDashboardPipelineData({
    organizationId: auth.organizationId,
  })

  const [jobs, invites, screeningMetrics, reportMetrics] = await Promise.all([
    prisma.jobPosition.count({
      where: {
        organizationId: auth.organizationId,
      },
    }),
    prisma.interviewInvite.count({
      where: {
        interview: {
          organizationId: auth.organizationId,
        },
      },
    }),
    getScreeningWorkflowMetrics(auth.organizationId),
    getReportAndDecisionMetrics(auth.organizationId),
  ])

  return {
    profile,
    pipeline: pipelineData.pipeline,
    workflowMetrics: {
      jobs,
      invites,
      screeningRuns: screeningMetrics.screeningRuns,
      shortlistedCandidates: screeningMetrics.shortlistedCandidates,
      screeningStarted: screeningMetrics.screeningRuns > 0,
      screeningCompleted: screeningMetrics.screeningRuns > 0 && screeningMetrics.shortlistedCandidates > 0,
      interviewsRunning: pipelineData.pipeline.inProgress,
      pendingReports: reportMetrics.pendingReports,
      decisionsPending: reportMetrics.decisionsPending,
    },
    pendingInterviews: pipelineData.pendingInterviews,
    recordedInterviews,
    candidates: candidates ?? [],
    veris,
  }
}

function getCachedOverview(cacheKey: string) {
  const cached = overviewCache.get(cacheKey)
  if (!cached) {
    return null
  }

  if (cached.expiresAt <= Date.now()) {
    overviewCache.delete(cacheKey)
    return null
  }

  return cached.value
}

function setCachedOverview(cacheKey: string, value: OverviewPayload) {
  overviewCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  })

  if (overviewCache.size <= CACHE_MAX) {
    return
  }

  const oldestKey = overviewCache.keys().next().value
  if (oldestKey) {
    overviewCache.delete(oldestKey)
  }
}

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const cacheKey = `overview:${auth.organizationId}`

    const cached = getCachedOverview(cacheKey)
    if (cached) {
      const response = NextResponse.json({ success: true, data: cached })
      response.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=30")
      response.headers.set("X-HireVeri-Cache", "hit")
      return response
    }

    let overviewPromise = inFlight.get(cacheKey)
    if (!overviewPromise) {
      overviewPromise = buildOverview(auth)
      inFlight.set(cacheKey, overviewPromise)
    }

    const overview = await overviewPromise.finally(() => {
      inFlight.delete(cacheKey)
    })

    setCachedOverview(cacheKey, overview)

    const response = NextResponse.json({ success: true, data: overview })

    response.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=30")
    response.headers.set("X-HireVeri-Cache", "miss")
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
