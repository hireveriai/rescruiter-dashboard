import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { prisma } from "@/lib/server/prisma"
import { getInterviewAppUrl } from "@/lib/server/interview-url"
import { getCandidatesDashboard } from "@/lib/server/services/dashboard.service"
import { getDashboardPipelineData } from "@/lib/server/services/dashboard-pipeline"
import { getRecruiterProfile } from "@/lib/server/services/recruiter-profile"
import { getVerisSummaryCards, type VerisSummaryCard } from "@/lib/server/services/reports.service"

type PipelineFunctionRow = {
  fn_get_dashboard_pipeline: {
    recordedInterviews?: Array<Record<string, unknown>>
  }
}

type OverviewPayload = {
  profile: Awaited<ReturnType<typeof getRecruiterProfile>>
  pipeline: {
    pending: number
    inProgress: number
    completed: number
    flagged: number
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

async function buildOverview(
  auth: Awaited<ReturnType<typeof getRecruiterRequestContext>>
): Promise<OverviewPayload> {
  const appUrl = getInterviewAppUrl()

  const [profile, pipelineRows, veris, candidates] = await Promise.all([
    getRecruiterProfile(auth),
    prisma.$queryRaw<PipelineFunctionRow[]>(Prisma.sql`
      select public.fn_get_dashboard_pipeline(
        ${auth.organizationId}::uuid,
        ${appUrl}
      )
    `),
    getVerisSummaryCards(auth.organizationId, 6),
    getCandidatesDashboard({
      organizationId: auth.organizationId,
      limit: 5,
    }),
  ])
  const pipelineData = await getDashboardPipelineData({
    organizationId: auth.organizationId,
  })

  const payload = pipelineRows[0]?.fn_get_dashboard_pipeline ?? {}

  return {
    profile,
    pipeline: pipelineData.pipeline,
    pendingInterviews: pipelineData.pendingInterviews,
    recordedInterviews: payload.recordedInterviews ?? [],
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
