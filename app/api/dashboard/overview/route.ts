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
const overviewCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<OverviewPayload>>()

async function buildOverview(
  auth: Awaited<ReturnType<typeof getRecruiterRequestContext>>
): Promise<OverviewPayload> {
  const pipelinePromise = getDashboardPipelineData({
    organizationId: auth.organizationId,
    limit: 5,
  })

  const [profile, candidates, pipelineData, alerts] = await Promise.all([
    getRecruiterProfile(auth),
    getCandidatesDashboard({
      organizationId: auth.organizationId,
      limit: 5,
      finalizeStale: false,
    }),
    pipelinePromise,
    getDashboardAlerts(auth.organizationId, 8),
  ])
  const workflowSnapshot = await getDashboardWorkflowSnapshot(auth.organizationId, pipelineData)

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
  try {
    const auth = await getRecruiterRequestContext(request)
    const cacheKey = `overview:${auth.organizationId}`
    const { searchParams } = new URL(request.url)
    const forceRefresh = searchParams.has("refresh") || searchParams.get("cache") === "bust"

    const cached = forceRefresh ? null : getCachedOverview(cacheKey)
    if (cached) {
      const response = NextResponse.json({ success: true, data: cached })
      response.headers.set("Cache-Control", "private, max-age=15, stale-while-revalidate=60")
      response.headers.set("X-HireVeri-Cache", "hit")
      return response
    }

    let overviewPromise = forceRefresh ? null : inFlight.get(cacheKey)
    if (!overviewPromise) {
      overviewPromise = buildOverview(auth)
      inFlight.set(cacheKey, overviewPromise)
    }

    const overview = await overviewPromise.finally(() => {
      inFlight.delete(cacheKey)
    })

    setCachedOverview(cacheKey, overview)

    const response = NextResponse.json({ success: true, data: overview })

    response.headers.set("Cache-Control", forceRefresh ? "no-store" : "private, max-age=15, stale-while-revalidate=60")
    response.headers.set("X-HireVeri-Cache", forceRefresh ? "refresh" : "miss")
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
