import { Prisma } from "@prisma/client"

import { ApiError } from "@/lib/server/errors"
import { prisma } from "@/lib/server/prisma"
import { RecruiterRequestContext } from "@/lib/server/auth-context"

type RecruiterBaseRow = {
  recruiter_name: string | null
  recruiter_email: string
  organization_name: string | null
}

type RecruiterProfileRow = {
  profile_company_name: string | null
  recruiter_role_id: number | null
  recruiter_profile_exists: boolean
}

export type RecruiterProfile = {
  name: string
  email: string
  organization: string
  userId: string
  organizationId: string
  recruiterRoleId: number | null
  recruiterProfileExists: boolean
  sessionCookieMatched: boolean
  sessionValidatedVia: "auth_session" | "identity_cookie" | "jwt"
}

export async function getRecruiterProfile(auth: RecruiterRequestContext): Promise<RecruiterProfile> {
  let recruiter: RecruiterBaseRow | undefined

  try {
    const baseRows = await prisma.$queryRaw<RecruiterBaseRow[]>(Prisma.sql`
      select
        u.full_name as recruiter_name,
        u.email as recruiter_email,
        o.organization_name
      from public.users u
      left join public.organizations o
        on o.organization_id = u.organization_id
      where u.user_id::text = ${auth.userId}
        and u.organization_id::text = ${auth.organizationId}
        and u.role = 'RECRUITER'
      limit 1
    `)

    recruiter = baseRows[0]
  } catch (error) {
    console.error("Recruiter base profile lookup failed", error)
    throw new ApiError(500, "RECRUITER_BASE_LOOKUP_FAILED", "Could not load recruiter workspace context")
  }

  if (!recruiter) {
    throw new ApiError(404, "RECRUITER_NOT_FOUND", "Recruiter not found for this authenticated session")
  }

  let profileCompanyName: string | null = null
  let recruiterRoleId: number | null = null
  let recruiterProfileExists = false

  void prisma.$queryRaw(Prisma.sql`
    select public.fn_ensure_default_recruiter_profile(
      ${auth.userId}::uuid,
      ${auth.organizationId}::uuid
    )
  `).catch((healingError) => {
    console.warn("Recruiter profile auto-heal skipped during /api/me bootstrap", healingError)
  })

  try {
    const profileRows = await prisma.$queryRaw<RecruiterProfileRow[]>(Prisma.sql`
      select
        rp.company_name as profile_company_name,
        rp.recruiter_role_id,
        (rp.recruiter_id is not null) as recruiter_profile_exists
      from public.recruiter_profiles rp
      where rp.recruiter_id::text = ${auth.userId}
      limit 1
    `)

    const profile = profileRows[0]

    if (profile) {
      profileCompanyName = profile.profile_company_name
      recruiterRoleId = profile.recruiter_role_id
      recruiterProfileExists = Boolean(profile.recruiter_profile_exists)
    }
  } catch (profileError) {
    console.warn("Recruiter profile lookup skipped during /api/me bootstrap", profileError)
  }

  return {
    name: recruiter.recruiter_name ?? recruiter.recruiter_email,
    email: recruiter.recruiter_email,
    organization: recruiter.organization_name ?? profileCompanyName ?? "",
    userId: auth.userId,
    organizationId: auth.organizationId,
    recruiterRoleId,
    recruiterProfileExists,
    sessionCookieMatched: auth.sessionCookieMatched,
    sessionValidatedVia: auth.sessionValidatedVia,
  }
}
