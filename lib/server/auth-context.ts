import { Prisma } from "@prisma/client"

import { ApiError } from "@/lib/server/errors"
import { prisma } from "@/lib/server/prisma"

export type RecruiterRequestContext = {
  userId: string
  organizationId: string
  sessionCookiePresent: boolean
  sessionCookieMatched: boolean
  sessionValidatedVia: "auth_session"
}

type AuthSessionRow = {
  session_id: string
  identity_id: string
}

type RecruiterLookupRow = {
  user_id: string
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

function toUuidOrNull(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  return UUID_REGEX.test(trimmed) ? trimmed : null
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return "Unknown database error"
}

export async function getRecruiterRequestContext(request: Request): Promise<RecruiterRequestContext> {
  const url = new URL(request.url)
  const hintedUserId = toUuidOrNull(String(url.searchParams.get("userId") ?? "").trim())
  const hintedOrganizationId = toUuidOrNull(String(url.searchParams.get("organizationId") ?? "").trim())

  if (!hintedUserId || !hintedOrganizationId) {
    throw new ApiError(401, "AUTH_CONTEXT_MISSING", "userId and organizationId are required in the URL")
  }

  const cookieMap = parseCookieHeader(request.headers.get("cookie"))
  const sessionCookie = cookieMap.hireveri_session
  const sessionId = toUuidOrNull(sessionCookie)

  if (!sessionCookie || !sessionId) {
    throw new ApiError(401, "SESSION_COOKIE_MISSING", "Authenticated recruiter session is missing")
  }

  let sessionRows

  try {
    sessionRows = await prisma.$queryRaw<AuthSessionRow[]>(Prisma.sql`
      select
        s.session_id::text as session_id,
        s.identity_id::text as identity_id
      from public.auth_sessions s
      where s.session_id::text = ${sessionId}
        and s.is_active = true
        and s.expires_at > now()
      limit 1
    `)
  } catch (error) {
    console.error("Recruiter auth session lookup failed", error)
    throw new ApiError(500, "AUTH_SESSION_LOOKUP_FAILED", `Could not validate recruiter session: ${getErrorMessage(error)}`)
  }

  const session = sessionRows[0]

  if (!session?.identity_id) {
    throw new ApiError(401, "INVALID_SESSION", "Authenticated recruiter session is invalid or expired")
  }

  let recruiterRows

  try {
    recruiterRows = await prisma.$queryRaw<RecruiterLookupRow[]>(Prisma.sql`
      select u.user_id::text as user_id
      from public.users u
      where u.user_id::text = ${hintedUserId}
        and u.organization_id::text = ${hintedOrganizationId}
        and u.identity_id::text = ${session.identity_id}
        and u.role = 'RECRUITER'
        and u.is_active = true
      limit 1
    `)
  } catch (error) {
    console.error("Recruiter user lookup failed", error)
    throw new ApiError(500, "RECRUITER_LOOKUP_FAILED", `Could not validate recruiter access: ${getErrorMessage(error)}`)
  }

  if (!recruiterRows[0]?.user_id) {
    throw new ApiError(401, "RECRUITER_NOT_FOUND", "Recruiter not found for the authenticated session")
  }

  return {
    userId: hintedUserId,
    organizationId: hintedOrganizationId,
    sessionCookiePresent: true,
    sessionCookieMatched: true,
    sessionValidatedVia: "auth_session",
  }
}
