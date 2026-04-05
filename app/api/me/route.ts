import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { pgPool } from "@/lib/server/pg"
import { errorResponse } from "@/lib/server/response"

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

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)

    let recruiter: RecruiterBaseRow | undefined

    try {
      const baseRows = await pgPool.query<RecruiterBaseRow>(
        `
          select
            u.full_name as recruiter_name,
            u.email as recruiter_email,
            o.organization_name
          from public.users u
          left join public.organizations o
            on o.organization_id = u.organization_id
          where u.user_id::text = $1
            and u.organization_id::text = $2
            and u.role = 'RECRUITER'
          limit 1
        `,
        [auth.userId, auth.organizationId]
      )

      recruiter = baseRows.rows[0]
    } catch (error) {
      console.error("Recruiter base profile lookup failed", error)
      throw new ApiError(500, "RECRUITER_BASE_LOOKUP_FAILED", "Could not load recruiter workspace context")
    }

    if (!recruiter) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RECRUITER_NOT_FOUND",
            message: "Recruiter not found for this authenticated session",
          },
        },
        { status: 404 }
      )
    }

    let profileCompanyName: string | null = null
    let recruiterRoleId: number | null = null
    let recruiterProfileExists = false

    try {
      await pgPool.query(
        `
          select public.fn_ensure_default_recruiter_profile(
            $1::uuid,
            $2::uuid
          )
        `,
        [auth.userId, auth.organizationId]
      )
    } catch (healingError) {
      console.warn("Recruiter profile auto-heal skipped during /api/me bootstrap", healingError)
    }

    try {
      const profileRows = await pgPool.query<RecruiterProfileRow>(
        `
          select
            rp.company_name as profile_company_name,
            rp.recruiter_role_id,
            (rp.recruiter_id is not null) as recruiter_profile_exists
          from public.recruiter_profiles rp
          where rp.recruiter_id::text = $1
          limit 1
        `,
        [auth.userId]
      )

      const profile = profileRows.rows[0]

      if (profile) {
        profileCompanyName = profile.profile_company_name
        recruiterRoleId = profile.recruiter_role_id
        recruiterProfileExists = Boolean(profile.recruiter_profile_exists)
      }
    } catch (profileError) {
      console.warn("Recruiter profile lookup skipped during /api/me bootstrap", profileError)
    }

    return NextResponse.json({
      success: true,
      data: {
        name: recruiter.recruiter_name ?? recruiter.recruiter_email,
        email: recruiter.recruiter_email,
        organization: recruiter.organization_name ?? profileCompanyName ?? "",
        userId: auth.userId,
        organizationId: auth.organizationId,
        recruiterRoleId,
        recruiterProfileExists,
        sessionCookieMatched: auth.sessionCookieMatched,
        sessionValidatedVia: auth.sessionValidatedVia,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
