import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { prisma } from "@/lib/server/prisma"

type RecruiterBootstrapRow = {
  recruiter_name: string | null
  recruiter_email: string
  organization_name: string | null
  profile_company_name: string | null
  recruiter_role_id: number | null
  recruiter_profile_exists: boolean
}

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)

    const rows = await prisma.$queryRaw<RecruiterBootstrapRow[]>(Prisma.sql`
      select
        u.full_name as recruiter_name,
        u.email as recruiter_email,
        o.organization_name,
        rp.company_name as profile_company_name,
        rp.recruiter_role_id,
        (rp.recruiter_id is not null) as recruiter_profile_exists
      from public.users u
      left join public.recruiter_profiles rp
        on rp.recruiter_id = u.user_id
      left join public.organizations o
        on o.organization_id = u.organization_id
      where u.user_id = ${auth.userId}::uuid
        and u.organization_id = ${auth.organizationId}::uuid
        and u.role = 'RECRUITER'
      limit 1
    `)

    const recruiter = rows[0]

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

    if (!recruiter.recruiter_profile_exists) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RECRUITER_PROFILE_MISSING",
            message: "Recruiter exists, but recruiter_profiles is missing for this account",
          },
          data: {
            name: recruiter.recruiter_name ?? recruiter.recruiter_email,
            organization: recruiter.organization_name ?? "",
            userId: auth.userId,
            organizationId: auth.organizationId,
            recruiterProfileExists: false,
          },
        },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        name: recruiter.recruiter_name ?? recruiter.recruiter_email,
        email: recruiter.recruiter_email,
        organization: recruiter.organization_name ?? recruiter.profile_company_name ?? "",
        userId: auth.userId,
        organizationId: auth.organizationId,
        recruiterRoleId: recruiter.recruiter_role_id,
        recruiterProfileExists: true,
        sessionCookieMatched: auth.sessionCookieMatched,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
