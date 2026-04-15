import { Prisma } from "@prisma/client"

import { ApiError } from "@/lib/server/errors"
import { prisma } from "@/lib/server/prisma"

export type RecruiterRequestContext = {
  userId: string
  organizationId: string
  sessionCookiePresent: boolean
  sessionCookieMatched: boolean
  sessionValidatedVia: "auth_session" | "identity_cookie" | "jwt"
}

type AuthSessionRow = {
  session_id: string
  identity_id: string
  is_active: boolean | null
}

type AuthIdentityRow = {
  identity_id: string
}

type AuthUserRow = {
  email: string | null
}

type RecruiterLookupRow = {
  user_id: string
  organization_id: string
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEV_AUTH_BYPASS =
  process.env.DEV_AUTH_BYPASS === "true" ||
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true" ||
  process.env.NODE_ENV === "development"

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

function decodeBase64Url(value: string): string | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")
    return Buffer.from(normalized, "base64").toString("utf8")
  } catch {
    return null
  }
}

function decodeJwtSub(token: string | null | undefined): string | null {
  if (!token) {
    return null
  }

  const parts = token.split(".")
  if (parts.length < 2) {
    return null
  }

  const payload = decodeBase64Url(parts[1])
  if (!payload) {
    return null
  }

  try {
    const parsed = JSON.parse(payload) as { sub?: string }
    const sub = parsed.sub?.trim()
    return sub && UUID_REGEX.test(sub) ? sub : null
  } catch {
    return null
  }
}

function parseSupabaseAuthCookieValue(rawValue: string): string | null {
  if (!rawValue) {
    return null
  }

  let decoded = rawValue

  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    decoded = rawValue
  }

  if (decoded.startsWith("base64-")) {
    const base64Payload = decoded.slice("base64-".length)
    const base64Decoded = decodeBase64Url(base64Payload)
    if (base64Decoded) {
      decoded = base64Decoded
    }
  }

  try {
    const parsed = JSON.parse(decoded) as { access_token?: string }
    return parsed.access_token ?? null
  } catch {
    return null
  }
}

function extractSupabaseJwtFromCookies(cookieMap: Record<string, string>): string | null {
  const authCookieKeys = Object.keys(cookieMap).filter((key) => key.startsWith("sb-") && key.includes("-auth-token"))
  if (authCookieKeys.length === 0) {
    return null
  }

  const grouped: Record<string, string[]> = {}

  authCookieKeys.forEach((key) => {
    const chunkMatch = key.match(/^(.*)\.(\d+)$/)
    if (chunkMatch) {
      const base = chunkMatch[1]
      const index = Number(chunkMatch[2])
      if (!grouped[base]) {
        grouped[base] = []
      }
      grouped[base][index] = cookieMap[key]
      return
    }

    grouped[key] = [cookieMap[key]]
  })

  for (const baseKey of Object.keys(grouped)) {
    const chunks = grouped[baseKey].filter(Boolean)
    const combined = chunks.join("")
    const accessToken = parseSupabaseAuthCookieValue(combined)
    if (accessToken) {
      return accessToken
    }
  }

  return null
}

function extractJwtFromRequest(request: Request, cookieMap: Record<string, string>): string | null {
  const authHeader = request.headers.get("authorization")
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim()
    if (token) {
      return token
    }
  }

  return extractSupabaseJwtFromCookies(cookieMap)
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

async function fetchAuthUserEmail(identityId: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<AuthUserRow[]>(Prisma.sql`
      select u.email
      from auth.users u
      where u.id::text = ${identityId}
      limit 1
    `)

    const email = rows[0]?.email
    return email ? email.trim().toLowerCase() : null
  } catch (error) {
    console.warn("Supabase auth.users lookup failed", error)
  }

  return null
}

async function reconcileRecruiterIdentity(
  identityId: string,
  hintedUserId: string | null,
  hintedOrganizationId: string | null
): Promise<RecruiterLookupRow | null> {
  const email = await fetchAuthUserEmail(identityId)

  if (!email) {
    return null
  }

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
          and lower(u.email) = ${email}
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
        where lower(u.email) = ${email}
          and u.role = 'RECRUITER'
          and u.is_active = true
        limit 1
      `)
    }

    const recruiter = recruiterRows?.[0]

    if (recruiter?.user_id) {
      await prisma.$queryRaw(Prisma.sql`
        update public.users
        set identity_id = ${identityId}::uuid
        where user_id::text = ${recruiter.user_id}
      `)
    }

    return recruiter ?? null
  } catch (error) {
    console.error("Recruiter identity reconciliation failed", error)
    return null
  }
}

async function reactivateAuthSessionIfNeeded(session: AuthSessionRow) {
  if (session.is_active === false) {
    try {
      await prisma.$queryRaw(Prisma.sql`
        update public.auth_sessions
        set is_active = true
        where session_id::text = ${session.session_id}
      `)
    } catch (error) {
      console.warn("Failed to reactivate recruiter session", error)
    }
  }
}

async function lookupRecruiterByParams(
  hintedUserId: string | null,
  hintedOrganizationId: string | null
): Promise<RecruiterLookupRow | null> {
  if (!hintedUserId || !hintedOrganizationId) {
    return null
  }

  try {
    const recruiterRows = await prisma.$queryRaw<RecruiterLookupRow[]>(Prisma.sql`
      select u.user_id::text as user_id,
             u.organization_id::text as organization_id
      from public.users u
      where u.user_id::text = ${hintedUserId}
        and u.organization_id::text = ${hintedOrganizationId}
        and u.role = 'RECRUITER'
        and u.is_active = true
      limit 1
    `)

    return recruiterRows[0] ?? null
  } catch (error) {
    console.error("Recruiter param lookup failed", error)
    throw new ApiError(500, "RECRUITER_LOOKUP_FAILED", `Could not validate recruiter access: ${getErrorMessage(error)}`)
  }
}

export async function getRecruiterRequestContext(request: Request): Promise<RecruiterRequestContext> {
  const url = new URL(request.url)
  const hintedUserId = toUuidOrNull(String(url.searchParams.get("userId") ?? "").trim())
  const hintedOrganizationId = toUuidOrNull(String(url.searchParams.get("organizationId") ?? "").trim())

  const cookieMap = parseCookieHeader(request.headers.get("cookie"))
  const sessionCookie = cookieMap.hireveri_session
  const sessionId = toUuidOrNull(sessionCookie)

  if (!sessionCookie || !sessionId) {
    if (DEV_AUTH_BYPASS) {
      const recruiter = await lookupRecruiterByParams(hintedUserId, hintedOrganizationId)
      if (recruiter?.user_id && recruiter.organization_id) {
        return {
          userId: recruiter.user_id,
          organizationId: recruiter.organization_id,
          sessionCookiePresent: false,
          sessionCookieMatched: false,
          sessionValidatedVia: "identity_cookie",
        }
      }
    }

    throw new ApiError(401, "SESSION_COOKIE_MISSING", "Authenticated recruiter session is missing")
  }

  let identityId: string | null = null
  let validatedVia: RecruiterRequestContext["sessionValidatedVia"] = "identity_cookie"

  const jwt = extractJwtFromRequest(request, cookieMap)
  if (jwt) {
    const jwtSub = decodeJwtSub(jwt)
    if (jwtSub) {
      identityId = jwtSub
      validatedVia = "jwt"
    }
  }

  let matchedSession: AuthSessionRow | null = null

  if (!identityId) {
    try {
      const sessionRows = await prisma.$queryRaw<AuthSessionRow[]>(Prisma.sql`
        select
          s.session_id::text as session_id,
          s.identity_id::text as identity_id,
          s.is_active
        from public.auth_sessions s
        where s.session_id::text = ${sessionId}
          and (s.expires_at is null or s.expires_at > now())
        limit 1
      `)

      if (sessionRows[0]?.identity_id) {
        matchedSession = sessionRows[0]
        identityId = sessionRows[0].identity_id
        validatedVia = "auth_session"
      }
    } catch (error) {
      console.warn("Recruiter auth session lookup skipped", error)
    }
  }

  if (matchedSession) {
    await reactivateAuthSessionIfNeeded(matchedSession)
  }

  if (!identityId) {
    identityId = await lookupIdentityFromSupabaseSession(sessionId)
  }

  if (!identityId) {
    if (DEV_AUTH_BYPASS) {
      const recruiter = await lookupRecruiterByParams(hintedUserId, hintedOrganizationId)
      if (recruiter?.user_id && recruiter.organization_id) {
        return {
          userId: recruiter.user_id,
          organizationId: recruiter.organization_id,
          sessionCookiePresent: true,
          sessionCookieMatched: false,
          sessionValidatedVia: "identity_cookie",
        }
      }
    }

    throw new ApiError(401, "INVALID_SESSION", "Authenticated recruiter session is invalid or expired")
  }

  let recruiter = await lookupRecruiterByIdentity(identityId, hintedUserId, hintedOrganizationId)

  if (!recruiter) {
    recruiter = await reconcileRecruiterIdentity(identityId, hintedUserId, hintedOrganizationId)
  }

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
