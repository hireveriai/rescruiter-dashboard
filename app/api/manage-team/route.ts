import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { prisma } from "@/lib/server/prisma"

type PermissionDetail = {
  code: string
  description: string | null
}

type TeamMemberRow = {
  user_id: string
  full_name: string | null
  email: string
  role: string
  is_active: boolean
  created_at: string
  recruiter_role_id: number | null
  recruiter_role_code: string | null
  recruiter_role_description: string | null
  permission_details: PermissionDetail[] | null
}

type TeamSummaryRow = {
  organization_name: string | null
  total_members: number
  active_members: number
  recruiters: number
  admins: number
}

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)

    const summaryRows = await prisma.$queryRaw<TeamSummaryRow[]>(Prisma.sql`
      select
        o.organization_name,
        count(u.user_id)::int as total_members,
        count(*) filter (where u.is_active = true)::int as active_members,
        count(*) filter (where u.role = 'RECRUITER')::int as recruiters,
        count(*) filter (where u.role in ('ADMIN', 'ORG_OWNER'))::int as admins
      from public.organizations o
      left join public.users u
        on u.organization_id = o.organization_id
       and u.role in ('RECRUITER', 'ADMIN', 'ORG_OWNER')
      where o.organization_id = ${auth.organizationId}::uuid
      group by o.organization_name
      limit 1
    `)

    const teamRows = await prisma.$queryRaw<TeamMemberRow[]>(Prisma.sql`
      select
        u.user_id,
        u.full_name,
        u.email,
        u.role,
        u.is_active,
        u.created_at::text,
        rp.recruiter_role_id,
        rrp.code as recruiter_role_code,
        rrp.description as recruiter_role_description,
        coalesce(
          jsonb_agg(
            distinct jsonb_build_object(
              'code', perms.permission,
              'description', pd.description
            )
          ) filter (where perms.permission is not null),
          '[]'::jsonb
        ) as permission_details
      from public.users u
      left join public.recruiter_profiles rp
        on rp.recruiter_id = u.user_id
      left join public.recruiter_role_pool rrp
        on rrp.recruiter_role_id = rp.recruiter_role_id
      left join public.role_permissions perms
        on perms.recruiter_role_id = rp.recruiter_role_id
      left join public.permissions pd
        on pd.permission_code = perms.permission
      where u.organization_id = ${auth.organizationId}::uuid
        and u.role in ('RECRUITER', 'ADMIN', 'ORG_OWNER')
      group by
        u.user_id,
        u.full_name,
        u.email,
        u.role,
        u.is_active,
        u.created_at,
        rp.recruiter_role_id,
        rrp.code,
        rrp.description
      order by
        case when u.user_id = ${auth.userId}::uuid then 0 else 1 end,
        u.created_at desc
    `)

    const summary = summaryRows[0] ?? {
      organization_name: null,
      total_members: 0,
      active_members: 0,
      recruiters: 0,
      admins: 0,
    }

    return NextResponse.json({
      success: true,
      data: {
        organization: summary.organization_name ?? "",
        summary: {
          totalMembers: summary.total_members,
          activeMembers: summary.active_members,
          recruiters: summary.recruiters,
          admins: summary.admins,
        },
        team: teamRows.map((member) => ({
          userId: member.user_id,
          name: member.full_name ?? member.email,
          email: member.email,
          platformRole: member.role,
          isActive: member.is_active,
          joinedAt: member.created_at,
          recruiterRoleId: member.recruiter_role_id,
          organizationRoleCode: member.recruiter_role_code,
          organizationRoleDescription: member.recruiter_role_description,
          permissions: member.permission_details ?? [],
          isCurrentUser: member.user_id === auth.userId,
        })),
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
