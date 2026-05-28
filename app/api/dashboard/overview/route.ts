import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { getCandidatesDashboard } from "@/lib/server/services/dashboard.service"
import { getDashboardPipelineData } from "@/lib/server/services/dashboard-pipeline"
import { deriveDashboardState } from "@/lib/dashboard/dashboard-state-engine"
import { getRecruiterProfile } from "@/lib/server/services/recruiter-profile"
import { getDashboardAlerts, type DashboardAlert } from "@/lib/server/services/dashboard-alerts"
import { getDashboardWorkflowSnapshot } from "@/lib/server/services/dashboard-workflow"

type OverviewPayload = {
  partial?: boolean
  profile: Awaited<ReturnType<typeof getRecruiterProfile>>
  pipeline: {
    pending: number
    inProgress: number
    completed: number
    flagged: number
  }
  workflowMetrics: {
    jobs: number
    activeJobs: number
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
  pendingInterviews: Array<Record<string, unknown>>
  pendingInterviewsTotal: number
  recordedInterviews?: Array<Record<string, unknown>>
  candidates: Awaited<ReturnType<typeof getCandidatesDashboard>>
  veris?: Array<Record<string, unknown>>
  alerts: DashboardAlert[]
}

type CacheEntry = {
  value: OverviewPayload
  expiresAt: number
}

const CACHE_TTL_MS = 15000
const CACHE_MAX = 50
const SLOW_DASHBOARD_ROUTE_MS = 1200
const SLOW_DASHBOARD_STEP_MS = 750
const overviewCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<OverviewPayload>>()

async function timedStep<T>(name: string, operation: () => Promise<T>) {
  const startedAt = Date.now()
  const result = await operation()
  const durationMs = Date.now() - startedAt

  if (durationMs >= SLOW_DASHBOARD_STEP_MS) {
    console.warn(JSON.stringify({
      level: "warn",
      msg: "slow_dashboard_step",
      step: name,
      durationMs,
    }))
  }

  return { result, durationMs }
}

function emptyDashboardState() {
  return deriveDashboardState({
    jobs_count: 0,
    active_jobs_count: 0,
    veris_screening_count: 0,
    interview_links_count: 0,
    interviews_count: 0,
    pending_reviews_count: 0,
  })
}

async function buildFastOverview(
  auth: Awaited<ReturnType<typeof getRecruiterRequestContext>>
): Promise<OverviewPayload> {
  const [profileStep, alertsStep] = await Promise.all([
    timedStep("profile", () => getRecruiterProfile(auth)),
    timedStep("alerts", () => getDashboardAlerts(auth.organizationId, 8, auth.userId).catch(() => [])),
  ])
  const profile = profileStep.result
  const alerts = alertsStep.result

  return {
    partial: true,
    profile,
    pipeline: undefined as unknown as OverviewPayload["pipeline"],
    workflowMetrics: undefined as unknown as OverviewPayload["workflowMetrics"],
    dashboardState: emptyDashboardState(),
    pendingInterviews: undefined as unknown as OverviewPayload["pendingInterviews"],
    pendingInterviewsTotal: undefined as unknown as OverviewPayload["pendingInterviewsTotal"],
    candidates: undefined as unknown as Awaited<ReturnType<typeof getCandidatesDashboard>>,
    alerts,
  }
}

async function buildOverview(
  auth: Awaited<ReturnType<typeof getRecruiterRequestContext>>
): Promise<OverviewPayload> {
  const pipelinePromise = timedStep("pipeline", () => getDashboardPipelineData({
    organizationId: auth.organizationId,
    limit: 5,
    finalizeStale: false,
    ensureRecoverySchema: false,
  }))

  const [profileStep, candidatesStep, pipelineStep, alertsStep] = await Promise.all([
    timedStep("profile", () => getRecruiterProfile(auth)),
    timedStep("candidates", () => getCandidatesDashboard({
      organizationId: auth.organizationId,
      limit: 5,
      finalizeStale: false,
      includeAnswerSummaries: false,
    })),
    pipelinePromise,
    timedStep("alerts", () => getDashboardAlerts(auth.organizationId, 8, auth.userId)),
  ])
  const profile = profileStep.result
  const candidates = candidatesStep.result
  const pipelineData = pipelineStep.result
  const alerts = alertsStep.result
  const workflowStep = await timedStep("workflow", () => getDashboardWorkflowSnapshot(auth.organizationId, pipelineData))
  const workflowSnapshot = workflowStep.result

  return {
    profile,
    pipeline: pipelineData.pipeline,
    workflowMetrics: {
      ...workflowSnapshot.workflowMetrics,
      interviewsRunning: pipelineData.pipeline.inProgress,
    },
    dashboardState: workflowSnapshot.dashboardState,
    pendingInterviews: pipelineData.pendingInterviews,
    pendingInterviewsTotal: pipelineData.pendingTotal,
    candidates: candidates ?? [],
    alerts,
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
  const routeStartedAt = Date.now()

  try {
    const authStartedAt = Date.now()
    const auth = await getRecruiterRequestContext(request)
    const authMs = Date.now() - authStartedAt
    const cacheKey = `overview:${auth.organizationId}:${auth.userId}`
    const { searchParams } = new URL(request.url)
    const forceRefresh = searchParams.has("refresh") || searchParams.get("cache") === "bust"
    const fullOverview = searchParams.get("full") === "1"

    const cached = forceRefresh ? null : getCachedOverview(cacheKey)
    if (cached) {
      const response = NextResponse.json({ success: true, data: cached })
      const durationMs = Date.now() - routeStartedAt
      response.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60")
      response.headers.set("X-HireVeri-Cache", "hit")
      response.headers.set("Server-Timing", `auth;dur=${authMs}, total;dur=${durationMs}`)
      return response
    }

    if (!fullOverview && !forceRefresh) {
      const dataStartedAt = Date.now()
      const overview = await buildFastOverview(auth)
      const dataMs = Date.now() - dataStartedAt
      const durationMs = Date.now() - routeStartedAt
      const response = NextResponse.json({ success: true, data: overview })
      response.headers.set("Cache-Control", "private, max-age=5, stale-while-revalidate=30")
      response.headers.set("X-HireVeri-Cache", "fast")
      response.headers.set("Server-Timing", `auth;dur=${authMs}, data;dur=${dataMs}, total;dur=${durationMs}`)
      return response
    }

    let overviewPromise = forceRefresh ? null : inFlight.get(cacheKey)
    if (!overviewPromise) {
      overviewPromise = buildOverview(auth)
      inFlight.set(cacheKey, overviewPromise)
    }

    const dataStartedAt = Date.now()
    const overview = await overviewPromise.finally(() => {
      inFlight.delete(cacheKey)
    })
    const dataMs = Date.now() - dataStartedAt

    setCachedOverview(cacheKey, overview)

    const response = NextResponse.json({ success: true, data: overview })
    const durationMs = Date.now() - routeStartedAt

    response.headers.set("Cache-Control", forceRefresh ? "no-store" : "private, max-age=15, stale-while-revalidate=60")
    response.headers.set("X-HireVeri-Cache", forceRefresh ? "refresh" : "miss")
    response.headers.set("Server-Timing", `auth;dur=${authMs}, data;dur=${dataMs}, total;dur=${durationMs}`)

    if (durationMs >= SLOW_DASHBOARD_ROUTE_MS) {
      console.warn(JSON.stringify({
        level: "warn",
        msg: "slow_dashboard_overview",
        cache: forceRefresh ? "refresh" : "miss",
        authMs,
        dataMs,
        durationMs,
      }))
    }

    return response
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      msg: "dashboard_overview_failed",
      durationMs: Date.now() - routeStartedAt,
      error: error instanceof Error ? error.message : String(error),
    }))
    return errorResponse(error)
  }
}
