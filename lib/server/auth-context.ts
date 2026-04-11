import { Prisma } from "@prisma/client"

import { ApiError } from "@/lib/server/errors"
import { prisma } from "@/lib/server/prisma"

export type RecruiterRequestContext = {
  userId: string
  organizationId: string
  sessionCookiePresent: boolean
  sessionCookieMatched: boolean
  sessionValidatedVia: "auth_session" | "identity_cookie"
}

type AuthSessionRow = {
  session_id: string
  identity_id: string
}

type AuthIdentityRow = {
  identity_id: string
}

type RecruiterLookupRow = {
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

async function lookupIdentityFromSupabaseSession(sessionId: string): Promise<string | null> {
  try {
    const sessionRows = await prisma.$queryRaw<AuthIdentityRow[]>(Prisma.sql`
      select s.user_id::text as identity_id
      from auth.sessions s
      where s.id::text = ${sessionId}
      limit 1
    `)

    if (sessionRows[0]?.identity_id) {
      return sessionRows[0].identity_id
    }
  } catch (error) {
    console.warn("Supabase auth.sessions lookup failed", error)
  }

  try {
    const refreshRows = await prisma.$queryRaw<AuthIdentityRow[]>(Prisma.sql`
      select rt.user_id::text as identity_id
      from auth.refresh_tokens rt
      where rt.id::text = ${sessionId}
         or rt.session_id::text = ${sessionId}
      limit 1
    `)

    if (refreshRows[0]?.identity_id) {
      return refreshRows[0].identity_id
    }
  } catch (error) {
    console.warn("Supabase auth.refresh_tokens lookup failed", error)
  }

  return null
}

async function lookupRecruiterByIdentity(
  identityId: string,
  hintedUserId: string | null,
  hintedOrganizationId: string | null
): Promise<RecruiterLookupRow | null> {
  let recruiterRows
  const hasHints = Boolean(hintedUserId && hintedOrganizationId)

  try {
    if (hasHints) {
      recruiterRows = await prisma.$queryRaw<RecruiterLookupRow[]>(Prisma.sql`
        select u.user_id::text as user_id,
               u.organization_id::text as organization_id
        from public.users u
        where u.user_id::text = ${hintedUserId}
          and u.organization_id::text = ${hintedOrganizationId}
          and u.identity_id::text = ${identityId}
          and u.role = 'RECRUITER'
          and u.is_active = true
        limit 1
      `)
    }

    if (!recruiterRows || recruiterRows.length === 0) {
      recruiterRows = await prisma.$queryRaw<RecruiterLookupRow[]>(Prisma.sql`
        select u.user_id::text as user_id,
               u.organization_id::text as organization_id
        from public.users u
        where u.identity_id::text = ${identityId}
          and u.role = 'RECRUITER'
          and u.is_active = true
        limit 1
      `)
    }
  } catch (error) {
    console.error("Recruiter user lookup failed", error)
    throw new ApiError(500, "RECRUITER_LOOKUP_FAILED", `Could not validate recruiter access: ${getErrorMessage(error)}`)
  }

  return recruiterRows[0] ?? null
}

export async function getRecruiterRequestContext(request: Request): Promise<RecruiterRequestContext> {
  const url = new URL(request.url)
  const hintedUserId = toUuidOrNull(String(url.searchParams.get("userId") ?? "").trim())
  const hintedOrganizationId = toUuidOrNull(String(url.searchParams.get("organizationId") ?? "").trim())

  const cookieMap = parseCookieHeader(request.headers.get("cookie"))
  const sessionCookie = cookieMap.hireveri_session
  const sessionId = toUuidOrNull(sessionCookie)

  if (!sessionCookie || !sessionId) {
    throw new ApiError(401, "SESSION_COOKIE_MISSING", "Authenticated recruiter session is missing")
  }

  let identityId: string | null = null
  let validatedVia: RecruiterRequestContext["sessionValidatedVia"] = "identity_cookie"

  try {
    const sessionRows = await prisma.$queryRaw<AuthSessionRow[]>(Prisma.sql`
      select
        s.session_id::text as session_id,
        s.identity_id::text as identity_id
      from public.auth_sessions s
      where s.session_id::text = ${sessionId}
        and s.is_active = true
        and s.expires_at > now()
      limit 1
    `)

    if (sessionRows[0]?.identity_id) {
      identityId = sessionRows[0].identity_id
      validatedVia = "auth_session"
    }
  } catch (error) {
    console.warn("Recruiter auth session lookup skipped", error)
  }

  if (!identityId) {
    identityId = await lookupIdentityFromSupabaseSession(sessionId)
  }

  if (!identityId) {
    throw new ApiError(401, "INVALID_SESSION", "Authenticated recruiter session is invalid or expired")
  }

  const recruiter = await lookupRecruiterByIdentity(identityId, hintedUserId, hintedOrganizationId)

  if (!recruiter?.user_id || !recruiter.organization_id) {
    throw new ApiError(401, "RECRUITER_NOT_FOUND", "Recruiter not found for the authenticated session")
  }

  return {
    userId: recruiter.user_id,
    organizationId: recruiter.organization_id,
    sessionCookiePresent: true,
    sessionCookieMatched: true,
    sessionValidatedVia: validatedVia,
  }
}
