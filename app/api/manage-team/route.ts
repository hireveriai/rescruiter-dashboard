import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { prisma } from "@/lib/server/prisma"
import { errorResponse } from "@/lib/server/response"
import { sendRecruiterAccessEmail } from "@/lib/services/email.service"

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

type AvailableRoleRow = {
  recruiter_role_id: number
  code: string | null
  description: string | null
  permission_details: PermissionDetail[] | null
}

type CreateTeamMemberRow = {
  user_id: string
  recruiter_role_id: number
  created_new: boolean
}

type TeamMemberLookupRow = {
  user_id: string
  full_name: string | null
  email: string
  organization_name: string | null
}

type ManageTeamMemberRow = {
  user_id: string
  recruiter_role_id: number | null
  is_active: boolean
}

type RecruiterAuth = {
  userId: string
  organizationId: string
}

function getRecruiterAppUrl() {
  return (
    process.env.RECRUITER_APP_URL ||
    process.env.NEXT_PUBLIC_RECRUITER_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://recruiter.verihireai.work"
  )
}

async function getTeamWorkspace(auth: RecruiterAuth) {
  await prisma.$queryRaw(Prisma.sql`
    select public.fn_ensure_default_recruiter_profile(
      ${auth.userId}::uuid,
      ${auth.organizationId}::uuid
    )
  `)
  const summaryRows = await prisma.$queryRaw<TeamSummaryRow[]>(Prisma.sql`
    select
      o.organization_name,
      count(u.user_id)::int as total_members,
      count(*) filter (where u.is_active = true)::int as active_members,
      count(*) filter (where u.role = 'RECRUITER')::int as recruiters,
      count(*) filter (
        where rp.recruiter_role_id is not null
          and (
            lower(coalesce(rrp.code, '')) like '%founder%'
            or lower(coalesce(rrp.code, '')) like '%super%'
            or exists (
              select 1
              from public.role_permissions perms_admin
              where perms_admin.recruiter_role_id = rp.recruiter_role_id
                and perms_admin.permission in ('users.manage', 'organization.settings')
            )
          )
      )::int as admins
    from public.organizations o
    left join public.users u
      on u.organization_id = o.organization_id
     and u.role in ('RECRUITER', 'ADMIN', 'ORG_OWNER')
    left join public.recruiter_profiles rp
      on rp.recruiter_id = u.user_id
    left join public.recruiter_role_pool rrp
      on rrp.recruiter_role_id = rp.recruiter_role_id
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

  const availableRoleRows = await prisma.$queryRaw<AvailableRoleRow[]>(Prisma.sql`
    select
      rrp.recruiter_role_id,
      rrp.code,
      rrp.description,
      coalesce(
        jsonb_agg(
          distinct jsonb_build_object(
            'code', perms.permission,
            'description', pd.description
          )
        ) filter (where perms.permission is not null),
        '[]'::jsonb
      ) as permission_details
    from public.recruiter_role_pool rrp
    left join public.role_permissions perms
      on perms.recruiter_role_id = rrp.recruiter_role_id
    left join public.permissions pd
      on pd.permission_code = perms.permission
    group by rrp.recruiter_role_id, rrp.code, rrp.description
    order by rrp.recruiter_role_id asc
  `)

  const summary = summaryRows[0] ?? {
    organization_name: null,
    total_members: 0,
    active_members: 0,
    recruiters: 0,
    admins: 0,
  }

  const team = teamRows.map((member) => ({
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
  }))

  const currentMember = team.find((member) => member.isCurrentUser)
  const canManageUsers =
    currentMember?.permissions?.some((permission) => permission.code === "users.manage") ?? false

  return {
    organization: summary.organization_name ?? "",
    summary: {
      totalMembers: summary.total_members,
      activeMembers: summary.active_members,
      recruiters: summary.recruiters,
      admins: summary.admins,
    },
    team,
    canManageUsers,
    availableRoles: availableRoleRows.map((role) => ({
      recruiterRoleId: role.recruiter_role_id,
      code: role.code,
      description: role.description,
      permissions: role.permission_details ?? [],
    })),
  }
}

async function getTeamMemberForAccessEmail(auth: RecruiterAuth, targetUserId: string) {
  const rows = await prisma.$queryRaw<TeamMemberLookupRow[]>(Prisma.sql`
    select
      u.user_id,
      u.full_name,
      u.email,
      o.organization_name
    from public.users u
    inner join public.organizations o
      on o.organization_id = u.organization_id
    where u.user_id = ${targetUserId}::uuid
      and u.organization_id = ${auth.organizationId}::uuid
      and u.role in ('RECRUITER', 'ADMIN', 'ORG_OWNER')
    limit 1
  `)

  return rows[0] ?? null
}

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const data = await getTeamWorkspace(auth)

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const body = await request.json()

    const fullName = String(body.fullName ?? body.full_name ?? "").trim()
    const email = String(body.email ?? "").trim().toLowerCase()
    const recruiterRoleId = Number(body.recruiterRoleId ?? body.recruiter_role_id)

    if (!fullName || !email || !Number.isInteger(recruiterRoleId)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_INPUT",
            message: "fullName, email and recruiterRoleId are required",
          },
        },
        { status: 400 }
      )
    }

    const rows = await prisma.$queryRaw<CreateTeamMemberRow[]>(Prisma.sql`
      select *
      from public.fn_upsert_team_member(
        ${auth.userId}::uuid,
        ${auth.organizationId}::uuid,
        ${fullName},
        ${email},
        ${recruiterRoleId}::smallint,
        'RECRUITER',
        true
      )
    `)

    const created = rows[0]
    const data = await getTeamWorkspace(auth)

    return NextResponse.json(
      {
        success: true,
        data,
        createdUser: {
          userId: created?.user_id ?? null,
          recruiterRoleId: created?.recruiter_role_id ?? recruiterRoleId,
          createdNew: created?.created_new ?? false,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const body = await request.json()
    const action = String(body.action ?? "").trim()
    const targetUserId = String(body.userId ?? body.user_id ?? "").trim()

    if (!action || !targetUserId) {
      throw new ApiError(400, "INVALID_INPUT", "action and userId are required")
    }

    if (action === "resend-invite") {
      const teamMember = await getTeamMemberForAccessEmail(auth, targetUserId)

      if (!teamMember) {
        throw new ApiError(404, "TEAM_MEMBER_NOT_FOUND", "Team member not found in this organization")
      }

      const workspaceLink = `${getRecruiterAppUrl().replace(/\/$/, "")}/?userId=${auth.userId}&organizationId=${auth.organizationId}`

      await sendRecruiterAccessEmail({
        to: teamMember.email,
        name: teamMember.full_name ?? teamMember.email,
        organization: teamMember.organization_name ?? "HireVeri",
        link: workspaceLink,
      })

      return NextResponse.json({
        success: true,
        message: "Access email sent successfully",
      })
    }

    if (action !== "update-member") {
      throw new ApiError(400, "INVALID_ACTION", "Unsupported team action")
    }

    const recruiterRoleId =
      body.recruiterRoleId === null || body.recruiterRoleId === undefined || body.recruiterRoleId === ""
        ? null
        : Number(body.recruiterRoleId)
    const isActive =
      typeof body.isActive === "boolean"
        ? body.isActive
        : body.is_active === true || body.is_active === false
          ? Boolean(body.is_active)
          : null

    if (recruiterRoleId === null && isActive === null) {
      throw new ApiError(400, "INVALID_INPUT", "Provide recruiterRoleId and/or isActive")
    }

    if (recruiterRoleId !== null && !Number.isInteger(recruiterRoleId)) {
      throw new ApiError(400, "INVALID_INPUT", "recruiterRoleId must be a valid integer")
    }

    const recruiterRoleFragment = recruiterRoleId === null ? Prisma.sql`null` : Prisma.sql`${recruiterRoleId}::smallint`
    const isActiveFragment = isActive === null ? Prisma.sql`null` : Prisma.sql`${isActive}`

    await prisma.$queryRaw<ManageTeamMemberRow[]>(Prisma.sql`
      select *
      from public.fn_manage_team_member(
        ${auth.userId}::uuid,
        ${auth.organizationId}::uuid,
        ${targetUserId}::uuid,
        ${recruiterRoleFragment},
        ${isActiveFragment}
      )
    `)

    const data = await getTeamWorkspace(auth)

    return NextResponse.json({
      success: true,
      data,
      updatedUser: {
        userId: targetUserId,
        recruiterRoleId,
        isActive,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}



