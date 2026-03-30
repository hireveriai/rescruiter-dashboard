import { Prisma } from "@prisma/client"

import { ApiError } from "@/lib/server/errors"
import { prisma } from "@/lib/server/prisma"

type SessionClaims = {
  userId?: string
  user_id?: string
  organizationId?: string
  organization_id?: string
  sub?: string
  metadata?: {
    userId?: string
    user_id?: string
    organizationId?: string
    organization_id?: string
  }
}

export type RecruiterRequestContext = {
  userId: string
  organizationId: string
  sessionCookiePresent: boolean
  sessionCookieMatched: boolean
}

type RecruiterLookupRow = {
  user_id: string
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {}
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, part) => {
      const separatorIndex = part.indexOf("=")

      if (separatorIndex === -1) {
        return acc
      }

      const key = part.slice(0, separatorIndex).trim()
      const value = part.slice(separatorIndex + 1).trim()
      acc[key] = value
      return acc
    }, {})
}

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
    return Buffer.from(padded, "base64").toString("utf8")
  } catch {
    return null
  }
}

function safeJsonParse(value: string): SessionClaims | null {
  try {
    const parsed = JSON.parse(value) as SessionClaims
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

function parseHireveriSession(rawValue: string | undefined): SessionClaims | null {
  if (!rawValue) {
    return null
  }

  const decoded = (() => {
    try {
      return decodeURIComponent(rawValue)
    } catch {
      return rawValue
    }
  })()

  const directJson = safeJsonParse(decoded)
  if (directJson) {
    return directJson
  }

  const jwtParts = decoded.split(".")
  if (jwtParts.length === 3) {
    const jwtPayload = decodeBase64Url(jwtParts[1])
    const parsedJwtPayload = jwtPayload ? safeJsonParse(jwtPayload) : null

    if (parsedJwtPayload) {
      return parsedJwtPayload
    }
  }

  const base64Json = decodeBase64Url(decoded)
  return base64Json ? safeJsonParse(base64Json) : null
}

function readSessionUserId(session: SessionClaims | null): string | null {
  return session?.userId ?? session?.user_id ?? session?.metadata?.userId ?? session?.metadata?.user_id ?? session?.sub ?? null
}

function readSessionOrganizationId(session: SessionClaims | null): string | null {
  return session?.organizationId ?? session?.organization_id ?? session?.metadata?.organizationId ?? session?.metadata?.organization_id ?? null
}

export async function getRecruiterRequestContext(request: Request): Promise<RecruiterRequestContext> {
  const url = new URL(request.url)
  const userId = String(url.searchParams.get("userId") ?? "").trim()
  const organizationId = String(url.searchParams.get("organizationId") ?? "").trim()

  if (!userId || !organizationId) {
    throw new ApiError(401, "AUTH_CONTEXT_MISSING", "userId and organizationId are required in the URL")
  }

  const cookieMap = parseCookieHeader(request.headers.get("cookie"))
  const sessionCookie = cookieMap.hireveri_session

  if (!sessionCookie) {
    throw new ApiError(401, "SESSION_COOKIE_MISSING", "hireveri_session cookie is required")
  }

  const session = parseHireveriSession(sessionCookie)
  const sessionUserId = readSessionUserId(session)
  const sessionOrganizationId = readSessionOrganizationId(session)

  if (sessionUserId && sessionUserId !== userId) {
    throw new ApiError(401, "SESSION_USER_MISMATCH", "Session does not match the requested recruiter")
  }

  if (sessionOrganizationId && sessionOrganizationId !== organizationId) {
    throw new ApiError(401, "SESSION_ORGANIZATION_MISMATCH", "Session does not match the requested organization")
  }

  const recruiterRows = await prisma.$queryRaw<RecruiterLookupRow[]>(Prisma.sql`
    select u.user_id
    from public.users u
    where u.user_id = ${userId}::uuid
      and u.organization_id = ${organizationId}::uuid
      and u.role = 'RECRUITER'
    limit 1
  `)

  if (!recruiterRows[0]?.user_id) {
    throw new ApiError(404, "RECRUITER_NOT_FOUND", "Recruiter not found for the authenticated organization")
  }

  return {
    userId,
    organizationId,
    sessionCookiePresent: true,
    sessionCookieMatched: Boolean(sessionUserId || sessionOrganizationId),
  }
}
