import { Prisma } from "@prisma/client"

import { ApiError } from "@/lib/server/errors"
import { prisma } from "@/lib/server/prisma"

type SessionClaims = {
  userId?: string
  user_id?: string
  organizationId?: string
  organization_id?: string
  identityId?: string
  identity_id?: string
  sessionId?: string
  session_id?: string
  sid?: string
  jti?: string
  sub?: string
  metadata?: {
    userId?: string
    user_id?: string
    organizationId?: string
    organization_id?: string
    identityId?: string
    identity_id?: string
    sessionId?: string
    session_id?: string
    sid?: string
    jti?: string
  }
}

export type RecruiterRequestContext = {
  userId: string
  organizationId: string
  sessionCookiePresent: boolean
  sessionCookieMatched: boolean
  sessionValidatedVia: "auth_session" | "cookie_claims"
}

type RecruiterLookupRow = {
  user_id: string
}

type AuthSessionLookupRow = {
  session_id: string
  identity_id: string
  user_id: string
  organization_id: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  return session?.userId ?? session?.user_id ?? session?.metadata?.userId ?? session?.metadata?.user_id ?? null
}

function readSessionOrganizationId(session: SessionClaims | null): string | null {
  return session?.organizationId ?? session?.organization_id ?? session?.metadata?.organizationId ?? session?.metadata?.organization_id ?? null
}

function readSessionIdentityId(session: SessionClaims | null): string | null {
  return session?.identityId ?? session?.identity_id ?? session?.metadata?.identityId ?? session?.metadata?.identity_id ?? null
}

function readSessionId(session: SessionClaims | null): string | null {
  return session?.sessionId ?? session?.session_id ?? session?.sid ?? session?.jti ?? session?.metadata?.sessionId ?? session?.metadata?.session_id ?? session?.metadata?.sid ?? session?.metadata?.jti ?? null
}

function toUuidOrNull(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  return UUID_REGEX.test(trimmed) ? trimmed : null
}

export async function getRecruiterRequestContext(request: Request): Promise<RecruiterRequestContext> {
  const url = new URL(request.url)
  const hintedUserId = String(url.searchParams.get("userId") ?? "").trim()
  const hintedOrganizationId = String(url.searchParams.get("organizationId") ?? "").trim()

  const cookieMap = parseCookieHeader(request.headers.get("cookie"))
  const sessionCookie = cookieMap.hireveri_session

  if (!sessionCookie) {
    throw new ApiError(401, "SESSION_COOKIE_MISSING", "Authenticated recruiter session is missing")
  }

  const session = parseHireveriSession(sessionCookie)
  const cookieUserId = toUuidOrNull(readSessionUserId(session))
  const cookieOrganizationId = toUuidOrNull(readSessionOrganizationId(session))
  const cookieIdentityId = toUuidOrNull(readSessionIdentityId(session))
  const cookieSessionId = toUuidOrNull(readSessionId(session)) ?? toUuidOrNull(sessionCookie)

  let resolvedUserId: string | null = null
  let resolvedOrganizationId: string | null = null
  let sessionValidatedVia: RecruiterRequestContext["sessionValidatedVia"] | null = null

  if (cookieSessionId || cookieIdentityId) {
    const sessionRows = await prisma.$queryRaw<AuthSessionLookupRow[]>(Prisma.sql`
      select
        s.session_id,
        s.identity_id,
        u.user_id,
        u.organization_id
      from public.auth_sessions s
      join public.users u
        on u.identity_id = s.identity_id
      where s.is_active = true
        and s.expires_at > now()
        and u.role = 'RECRUITER'
        and (
          (${cookieSessionId}::uuid is not null and s.session_id = ${cookieSessionId}::uuid)
          or
          (${cookieIdentityId}::uuid is not null and s.identity_id = ${cookieIdentityId}::uuid)
        )
      order by case when ${cookieSessionId}::uuid is not null and s.session_id = ${cookieSessionId}::uuid then 0 else 1 end
      limit 1
    `)

    if (sessionRows[0]) {
      resolvedUserId = sessionRows[0].user_id
      resolvedOrganizationId = sessionRows[0].organization_id
      sessionValidatedVia = "auth_session"
    }
  }

  if (!resolvedUserId || !resolvedOrganizationId) {
    if (!cookieUserId || !cookieOrganizationId) {
      throw new ApiError(401, "INVALID_SESSION_COOKIE", "Recruiter session could not be validated from the shared auth cookie")
    }

    resolvedUserId = cookieUserId
    resolvedOrganizationId = cookieOrganizationId
    sessionValidatedVia = "cookie_claims"
  }

  if (hintedUserId && hintedUserId !== resolvedUserId) {
    throw new ApiError(401, "SESSION_USER_MISMATCH", "Session does not match the requested recruiter")
  }

  if (hintedOrganizationId && hintedOrganizationId !== resolvedOrganizationId) {
    throw new ApiError(401, "SESSION_ORGANIZATION_MISMATCH", "Session does not match the requested organization")
  }

  const recruiterRows = await prisma.$queryRaw<RecruiterLookupRow[]>(Prisma.sql`
    select u.user_id
    from public.users u
    where u.user_id = ${resolvedUserId}::uuid
      and u.organization_id = ${resolvedOrganizationId}::uuid
      and u.role = 'RECRUITER'
    limit 1
  `)

  if (!recruiterRows[0]?.user_id) {
    throw new ApiError(404, "RECRUITER_NOT_FOUND", "Recruiter not found for the authenticated organization")
  }

  if (!sessionValidatedVia) {
    throw new ApiError(401, "INVALID_SESSION_COOKIE", "Recruiter session could not be validated from the shared auth cookie")
  }

  return {
    userId: resolvedUserId,
    organizationId: resolvedOrganizationId,
    sessionCookiePresent: true,
    sessionCookieMatched: Boolean(cookieUserId || cookieOrganizationId || cookieSessionId || cookieIdentityId),
    sessionValidatedVia,
  }
}

