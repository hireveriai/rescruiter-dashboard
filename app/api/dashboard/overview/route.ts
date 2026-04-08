import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { prisma } from "@/lib/server/prisma"
import { getInterviewAppUrl } from "@/lib/server/interview-url"
import { getCandidatesDashboard } from "@/lib/server/services/dashboard.service"
import { getRecruiterProfile } from "@/lib/server/services/recruiter-profile"

type PipelineFunctionRow = {
  fn_get_dashboard_pipeline: {
    pipeline?: {
      pending?: number
      inProgress?: number
      completed?: number
      flagged?: number
    }
    pendingInterviews?: Array<Record<string, unknown>>
    recordedInterviews?: Array<Record<string, unknown>>
  }
}

type VerisRow = {
  attempt_id: string
  overall_score: number | null
  risk_level: string | null
  strengths: string | null
  weaknesses: string | null
  hire_recommendation: string | null
  created_at: Date | string | null
  candidate_name: string
  job_title: string
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
  veris: Array<{
    attemptId: string
    candidateName: string
    jobTitle: string
    overallScore: number | null
    riskLevel: string
    recommendation: string
    strengths: string
    weaknesses: string
    strengthsShort: string
    weaknessesShort: string
    createdAt: Date | string | null
  }>
}

type CacheEntry = {
  value: OverviewPayload
  expiresAt: number
}

const CACHE_TTL_MS = 5000
const CACHE_MAX = 50
const overviewCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, Promise<OverviewPayload>>()

function shorten(text: string | null, words = 18) {
  if (!text) {
    return "-"
  }

  const parts = text.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= words) {
    return parts.join(" ")
  }

  return `${parts.slice(0, words).join(" ")}...`
}

async function buildOverview(
  auth: Awaited<ReturnType<typeof getRecruiterRequestContext>>
): Promise<OverviewPayload> {
  const appUrl = getInterviewAppUrl()

  const [profile, pipelineRows, verisRows, candidates] = await Promise.all([
    getRecruiterProfile(auth),
    prisma.$queryRaw<PipelineFunctionRow[]>(Prisma.sql`
      select public.fn_get_dashboard_pipeline(
        ${auth.organizationId}::uuid,
        ${appUrl}
      )
    `),
    prisma.$queryRaw<VerisRow[]>(Prisma.sql`
      select *
      from public.fn_get_dashboard_veris(${auth.organizationId}::uuid, 6)
    `),
    getCandidatesDashboard({
      organizationId: auth.organizationId,
      limit: 5,
    }),
  ])

  const payload = pipelineRows[0]?.fn_get_dashboard_pipeline ?? {}
  const pipeline: OverviewPayload["pipeline"] = {
    pending: payload.pipeline?.pending ?? 0,
    inProgress: payload.pipeline?.inProgress ?? 0,
    completed: payload.pipeline?.completed ?? 0,
    flagged: payload.pipeline?.flagged ?? 0,
  }

  return {
    profile,
    pipeline,
    pendingInterviews: payload.pendingInterviews ?? [],
    recordedInterviews: payload.recordedInterviews ?? [],
    candidates: candidates ?? [],
    veris: verisRows.map((row) => ({
      attemptId: row.attempt_id,
      candidateName: row.candidate_name,
      jobTitle: row.job_title,
      overallScore: row.overall_score,
      riskLevel: row.risk_level ?? "-",
      recommendation: row.hire_recommendation ?? "-",
      strengths: row.strengths ?? "-",
      weaknesses: row.weaknesses ?? "-",
      strengthsShort: shorten(row.strengths),
      weaknessesShort: shorten(row.weaknesses),
      createdAt: row.created_at,
    })),
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
