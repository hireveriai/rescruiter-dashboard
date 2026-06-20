import { Prisma } from "@prisma/client"
import { createHash, createHmac, randomBytes, randomUUID } from "crypto"
import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { prisma } from "@/lib/server/prisma"
import { errorResponse } from "@/lib/server/response"
import {
  sendRecruiterOnboardingEmail,
  sendRecruiterOrganizationAddedEmail,
} from "@/lib/services/email.service"

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
  is_admin: boolean
  invite_status: "PENDING" | "ACCEPTED" | "EXPIRED" | null
  invite_expires_at: string | null
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
  recruiter_role_id: number | null
  recruiter_role_code: string | null
  recruiter_role_description: string | null
  invite_status: "PENDING" | "ACCEPTED" | "EXPIRED" | null
  invite_expires_at: string | null
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

type ExistsRow = {
  exists: boolean
}

type RoleLookupRow = {
  recruiter_role_id: number
  code: string | null
  description: string | null
}

type ActorLookupRow = {
  full_name: string | null
  email: string
}

type ExistingUserRow = {
  user_id: string
  full_name: string | null
  email: string
  organization_id: string
  is_active: boolean
  recruiter_role_id: number | null
}

const INVITE_TTL_HOURS = 72

function getRecruiterAppUrl() {
  return (
    process.env.RECRUITER_APP_URL ||
    process.env.NEXT_PUBLIC_RECRUITER_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://recruiter.verihireai.work"
  )
}

function getOnboardingBaseUrl() {
  const authUrl =
    process.env.AUTH_APP_URL ||
    process.env.NEXT_PUBLIC_AUTH_APP_URL ||
    process.env.NEXT_PUBLIC_RECRUITER_LOGIN_URL ||
    process.env.NEXT_PUBLIC_LOGIN_URL ||
    "https://auth.hireveri.com"
  const defaultUrl = new URL(authUrl)

  if (defaultUrl.pathname === "/" || defaultUrl.pathname === "") {
    defaultUrl.pathname = "/recruiter-access"
  }

  return (
    process.env.RECRUITER_ONBOARDING_URL ||
    process.env.NEXT_PUBLIC_RECRUITER_ONBOARDING_URL ||
    defaultUrl.toString()
  )
}

function getTokenSecret() {
  return process.env.RECRUITER_INVITE_TOKEN_SECRET || process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || "hireveri-dev-invite-secret"
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function signInviteToken(payload: string) {
  return createHmac("sha256", getTokenSecret()).update(payload).digest("base64url")
}

function createInviteToken(inviteId: string, expiresAt: Date) {
  const nonce = randomBytes(18).toString("base64url")
  const payload = `${inviteId}.${Math.floor(expiresAt.getTime() / 1000)}.${nonce}`
  return `${payload}.${signInviteToken(payload)}`
}

function getInviteStatus(status: string | null, expiresAt: string | null) {
  const normalized = String(status || "").toUpperCase()

  if (normalized === "ACCEPTED") {
    return "Accepted"
  }

  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return "Expired"
  }

  if (normalized === "PENDING") {
    return "Pending"
  }

  return "Accepted"
}

async function functionExists(functionName: string) {
  const rows = await prisma.$queryRaw<ExistsRow[]>(Prisma.sql`
    select exists (
      select 1
      from pg_proc p
      inner join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname = ${functionName}
    ) as exists
  `)

  return rows[0]?.exists ?? false
}

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRaw<ExistsRow[]>(Prisma.sql`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = ${tableName}
    ) as exists
  `)

  return rows[0]?.exists ?? false
}

async function columnExists(tableName: string, columnName: string) {
  const rows = await prisma.$queryRaw<ExistsRow[]>(Prisma.sql`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = ${tableName}
        and column_name = ${columnName}
    ) as exists
  `)

  return rows[0]?.exists ?? false
}

async function ensureManageTeamUserColumns() {
  await prisma.$executeRaw(Prisma.sql`
    alter table public.users
      add column if not exists team_removed_at timestamptz null
  `)

  await prisma.$executeRaw(Prisma.sql`
    create index if not exists idx_users_org_role_team_removed
      on public.users (organization_id, role, team_removed_at)
  `)
}

async function ensureTeamInviteTables() {
  await prisma.$executeRaw(Prisma.sql`
    create table if not exists public.recruiter_team_invites (
      invite_id uuid primary key default gen_random_uuid(),
      org_id uuid not null references public.organizations(organization_id) on delete cascade,
      invited_email text not null,
      invited_user_id uuid null references public.users(user_id) on delete cascade,
      invited_by uuid not null references public.users(user_id),
      invited_at timestamptz not null default now(),
      role_assigned smallint not null,
      token_hash text not null,
      expires_at timestamptz not null,
      accepted_at timestamptz null,
      status text not null default 'PENDING',
      email_status text not null default 'PENDING',
      last_sent_at timestamptz null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `)

  await prisma.$executeRaw(Prisma.sql`
    create table if not exists public.recruiter_team_invite_audit_logs (
      audit_id uuid primary key default gen_random_uuid(),
      invite_id uuid null,
      invited_by uuid not null,
      invited_at timestamptz not null default now(),
      role_assigned smallint not null,
      org_id uuid not null,
      invited_email text not null,
      action text not null,
      metadata jsonb not null default '{}'::jsonb
    )
  `)

  await prisma.$executeRaw(Prisma.sql`
    create index if not exists idx_recruiter_team_invites_org_email
      on public.recruiter_team_invites (org_id, lower(invited_email), invited_at desc)
  `)

  await prisma.$executeRaw(Prisma.sql`
    create index if not exists idx_recruiter_team_invites_token_hash
      on public.recruiter_team_invites (token_hash)
  `)
}

async function getRoleOrThrow(roleId: number) {
  const rows = await prisma.$queryRaw<RoleLookupRow[]>(Prisma.sql`
    select
      hrr.legacy_role_id as recruiter_role_id,
      hrr.name as code,
      null::text as description
    from public.hireveri_recruiter_roles hrr
    where hrr.legacy_role_id = ${roleId}::smallint
      and hrr.is_active = true
    limit 1
  `)

  const role = rows[0]

  if (!role) {
    throw new ApiError(400, "INVALID_RECRUITER_ROLE", "Selected organization role is not available")
  }

  return role
}

async function getActor(auth: RecruiterAuth) {
  const rows = await prisma.$queryRaw<ActorLookupRow[]>(Prisma.sql`
    select full_name, email
    from public.users
    where user_id = ${auth.userId}::uuid
      and organization_id = ${auth.organizationId}::uuid
    limit 1
  `)

  return rows[0] ?? null
}

async function assertCanManageUsers(auth: RecruiterAuth) {
  await ensureCurrentRecruiterAdminIfNoAdmin(auth)

  const rows = await prisma.$queryRaw<{ can_manage: boolean }[]>(Prisma.sql`
    select exists (
      select 1
      from public.recruiter_profiles arp
      inner join public.role_permissions perms
        on perms.recruiter_role_id = arp.recruiter_role_id
      where arp.recruiter_id = ${auth.userId}::uuid
        and arp.organization_id = ${auth.organizationId}::uuid
        and perms.permission = 'users.manage'
    ) as can_manage
  `)

  if (!rows[0]?.can_manage) {
    throw new ApiError(403, "INSUFFICIENT_PERMISSION", "users.manage is required")
  }
}

async function getDefaultAdminRoleId() {
  const rows = await prisma.$queryRaw<{ recruiter_role_id: number }[]>(Prisma.sql`
    select role_candidates.recruiter_role_id
    from (
      select rrp.recruiter_role_id, 0 as priority
      from public.recruiter_role_pool rrp
      where lower(coalesce(rrp.code, '')) in ('super_admin', 'super-admin', 'founder', 'founder/ceo', 'org_owner', 'org-owner')
         or lower(coalesce(rrp.code, '')) like '%founder%'
         or lower(coalesce(rrp.code, '')) like '%owner%'
      union all
      select rp.recruiter_role_id, 1 as priority
      from public.role_permissions rp
      group by rp.recruiter_role_id
      having bool_or(rp.permission = 'users.manage')
         and bool_or(rp.permission = 'organization.settings')
    ) role_candidates
    order by role_candidates.priority, role_candidates.recruiter_role_id
    limit 1
  `).catch(() => [] as { recruiter_role_id: number }[])

  return rows[0]?.recruiter_role_id ?? null
}

async function ensureCurrentRecruiterAdminIfNoAdmin(auth: RecruiterAuth) {
  const [hasRecruiterProfiles, hasRolePermissions] = await Promise.all([
    tableExists("recruiter_profiles"),
    tableExists("role_permissions"),
  ])

  if (!hasRecruiterProfiles || !hasRolePermissions) {
    return
  }

  const rows = await prisma.$queryRaw<{ has_admin: boolean; current_has_admin: boolean }[]>(Prisma.sql`
    select
      exists (
        select 1
        from public.users admin_user
        inner join public.recruiter_profiles admin_profile
          on admin_profile.recruiter_id = admin_user.user_id
          and admin_profile.organization_id = admin_user.organization_id
        inner join public.role_permissions admin_perms
          on admin_perms.recruiter_role_id = admin_profile.recruiter_role_id
        where admin_user.organization_id = ${auth.organizationId}::uuid
          and admin_user.role in ('RECRUITER', 'ADMIN', 'ORG_OWNER')
          and admin_user.is_active = true
          and admin_perms.permission in ('users.manage', 'organization.settings')
        group by admin_user.user_id
        having bool_or(admin_perms.permission = 'users.manage')
           and bool_or(admin_perms.permission = 'organization.settings')
        limit 1
      ) as has_admin,
      exists (
        select 1
        from public.recruiter_profiles current_profile
        inner join public.role_permissions current_perms
          on current_perms.recruiter_role_id = current_profile.recruiter_role_id
        where current_profile.recruiter_id = ${auth.userId}::uuid
          and current_profile.organization_id = ${auth.organizationId}::uuid
          and current_perms.permission in ('users.manage', 'organization.settings')
        group by current_profile.recruiter_id
        having bool_or(current_perms.permission = 'users.manage')
           and bool_or(current_perms.permission = 'organization.settings')
        limit 1
      ) as current_has_admin
  `).catch(() => [] as { has_admin: boolean; current_has_admin: boolean }[])
  const state = rows[0]

  if (state?.has_admin || state?.current_has_admin) {
    return
  }

  const roleId = await getDefaultAdminRoleId()

  if (!roleId) {
    return
  }

  await prisma.$executeRaw(Prisma.sql`
    insert into public.recruiter_profiles (
      recruiter_id,
      company_name,
      recruiter_role_id,
      organization_id
    )
    select
      u.user_id,
      coalesce(o.organization_name, 'Organization'),
      ${roleId}::smallint,
      u.organization_id
    from public.users u
    left join public.organizations o
      on o.organization_id = u.organization_id
    where u.user_id = ${auth.userId}::uuid
      and u.organization_id = ${auth.organizationId}::uuid
      and u.role in ('RECRUITER', 'ADMIN', 'ORG_OWNER')
      and u.is_active = true
    on conflict (recruiter_id) do update
    set
      recruiter_role_id = excluded.recruiter_role_id,
      company_name = coalesce(public.recruiter_profiles.company_name, excluded.company_name),
      organization_id = excluded.organization_id
  `).catch((error) => {
    console.warn("First recruiter admin repair skipped", error)
  })
}

async function getExistingUserByEmail(email: string) {
  await ensureManageTeamUserColumns()

  const rows = await prisma.$queryRaw<ExistingUserRow[]>(Prisma.sql`
    select
      u.user_id::text,
      u.full_name,
      u.email,
      u.organization_id::text,
      u.is_active,
      rp.recruiter_role_id
    from public.users u
    left join public.recruiter_profiles rp
      on rp.recruiter_id = u.user_id
    where lower(u.email) = lower(${email})
    limit 1
  `)

  return rows[0] ?? null
}

async function getTeamWorkspace(auth: RecruiterAuth) {
  await ensureManageTeamUserColumns()

  const [hasEnsureProfileFn, hasRecruiterProfiles, hasRecruiterRoles, hasRecruiterRolePool, hasRolePermissions, hasPermissions] =
    await Promise.all([
      functionExists("fn_ensure_default_recruiter_profile"),
      tableExists("recruiter_profiles"),
      tableExists("hireveri_recruiter_roles"),
      tableExists("recruiter_role_pool"),
      tableExists("role_permissions"),
      tableExists("permissions"),
    ])

  if (hasEnsureProfileFn) {
    try {
      await prisma.$queryRaw(Prisma.sql`
        select public.fn_ensure_default_recruiter_profile(
          ${auth.userId}::uuid,
          ${auth.organizationId}::uuid
        )
      `)
    } catch (error) {
      console.error("Failed to ensure recruiter profile for manage-team", error)
    }
  }

  await ensureCurrentRecruiterAdminIfNoAdmin(auth)

  const hasRoleSystem =
    hasRecruiterProfiles && hasRecruiterRoles && hasRolePermissions && hasPermissions
  const roleNameExpression = hasRecruiterRolePool
    ? Prisma.sql`coalesce(hrr.name, rrp.code, '')`
    : Prisma.sql`coalesce(hrr.name, '')`
  const roleDescriptionExpression = hasRecruiterRolePool
    ? Prisma.sql`rrp.description`
    : Prisma.sql`null::text`
  const rolePoolJoin = hasRecruiterRolePool
    ? Prisma.sql`left join public.recruiter_role_pool rrp on rrp.recruiter_role_id = rp.recruiter_role_id`
    : Prisma.sql``
  const availableRolePoolJoin = hasRecruiterRolePool
    ? Prisma.sql`left join public.recruiter_role_pool rrp on rrp.recruiter_role_id = hrr.legacy_role_id`
    : Prisma.sql``

  const summaryRowsPromise = prisma.$queryRaw<TeamSummaryRow[]>(Prisma.sql`
    select
      o.organization_name,
      count(u.user_id)::int as total_members,
      count(*) filter (where u.is_active = true)::int as active_members,
      count(*) filter (where u.role = 'RECRUITER')::int as recruiters,
      ${hasRoleSystem
        ? Prisma.sql`
            count(*) filter (
              where rp.recruiter_role_id is not null
                and (
                  lower(${roleNameExpression}) like '%founder%'
                  or lower(${roleNameExpression}) like '%super%'
                  or exists (
                    select 1
                    from public.role_permissions perms_admin
                    where perms_admin.recruiter_role_id = rp.recruiter_role_id
                      and perms_admin.permission in ('users.manage', 'organization.settings')
                  )
                )
            )::int
          `
        : Prisma.sql`count(*) filter (where u.role in ('ADMIN', 'ORG_OWNER'))::int`} as admins
    from public.organizations o
    left join public.users u
      on u.organization_id = o.organization_id
     and u.role in ('RECRUITER', 'ADMIN', 'ORG_OWNER')
     and u.team_removed_at is null
    ${hasRecruiterProfiles
      ? Prisma.sql`left join public.recruiter_profiles rp on rp.recruiter_id = u.user_id`
      : Prisma.sql``}
    ${hasRecruiterProfiles ? rolePoolJoin : Prisma.sql``}
    ${hasRecruiterProfiles && hasRecruiterRoles
      ? Prisma.sql`left join public.hireveri_recruiter_roles hrr on hrr.legacy_role_id = rp.recruiter_role_id`
      : Prisma.sql``}
    where o.organization_id = ${auth.organizationId}::uuid
    group by o.organization_name
    limit 1
  `)

  const teamRowsPromise = hasRoleSystem
    ? prisma.$queryRaw<TeamMemberRow[]>(Prisma.sql`
        select
          u.user_id,
          u.full_name,
          u.email,
          u.role,
          u.is_active,
          u.created_at::text,
          rp.recruiter_role_id,
          ${roleNameExpression} as recruiter_role_code,
          ${roleDescriptionExpression} as recruiter_role_description,
          (
            bool_or(perms.permission = 'users.manage')
            and bool_or(perms.permission = 'organization.settings')
          ) as is_admin,
          latest_invite.status as invite_status,
          latest_invite.expires_at::text as invite_expires_at,
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
        ${rolePoolJoin}
        left join public.hireveri_recruiter_roles hrr
          on hrr.legacy_role_id = rp.recruiter_role_id
        left join public.role_permissions perms
          on perms.recruiter_role_id = rp.recruiter_role_id
        left join public.permissions pd
          on pd.permission_code = perms.permission
        left join lateral (
          select
            case
              when rti.accepted_at is not null or rti.status = 'ACCEPTED' then 'ACCEPTED'
              when rti.expires_at < now() then 'EXPIRED'
              else rti.status
            end as status,
            rti.expires_at
          from public.recruiter_team_invites rti
          where rti.org_id = u.organization_id
            and lower(rti.invited_email) = lower(u.email)
          order by rti.invited_at desc
          limit 1
        ) latest_invite on true
        where u.organization_id = ${auth.organizationId}::uuid
          and u.role in ('RECRUITER', 'ADMIN', 'ORG_OWNER')
          and u.team_removed_at is null
        group by
          u.user_id,
          u.full_name,
          u.email,
          u.role,
          u.is_active,
          u.created_at,
          rp.recruiter_role_id,
          ${roleNameExpression},
          ${roleDescriptionExpression},
          latest_invite.status,
          latest_invite.expires_at
        order by
          case when u.user_id = ${auth.userId}::uuid then 0 else 1 end,
          u.created_at desc
      `)
    : prisma.$queryRaw<TeamMemberRow[]>(Prisma.sql`
        select
          u.user_id,
          u.full_name,
          u.email,
          u.role,
          u.is_active,
          u.created_at::text,
          null::smallint as recruiter_role_id,
          null::text as recruiter_role_code,
          null::text as recruiter_role_description,
          (u.role in ('ADMIN', 'ORG_OWNER')) as is_admin,
          null::text as invite_status,
          null::text as invite_expires_at,
          '[]'::jsonb as permission_details
        from public.users u
        where u.organization_id = ${auth.organizationId}::uuid
          and u.role in ('RECRUITER', 'ADMIN', 'ORG_OWNER')
          and u.team_removed_at is null
        order by
          case when u.user_id = ${auth.userId}::uuid then 0 else 1 end,
          u.created_at desc
      `)

  const availableRoleRowsPromise = hasRoleSystem
    ? prisma.$queryRaw<AvailableRoleRow[]>(Prisma.sql`
        select
          hrr.legacy_role_id as recruiter_role_id,
          hrr.name as code,
          ${hasRecruiterRolePool ? Prisma.sql`rrp.description` : Prisma.sql`null::text`} as description,
          coalesce(
            jsonb_agg(
              distinct jsonb_build_object(
                'code', perms.permission,
                'description', pd.description
              )
            ) filter (where perms.permission is not null),
            '[]'::jsonb
          ) as permission_details
        from public.hireveri_recruiter_roles hrr
        ${availableRolePoolJoin}
        left join public.role_permissions perms
          on perms.recruiter_role_id = hrr.legacy_role_id
        left join public.permissions pd
          on pd.permission_code = perms.permission
        where hrr.is_active = true
          and hrr.legacy_role_id is not null
        group by hrr.legacy_role_id, hrr.name, ${hasRecruiterRolePool ? Prisma.sql`rrp.description` : Prisma.sql`null::text`}, hrr.sort_order
        order by hrr.sort_order asc, hrr.name asc
      `)
    : []

  const [summaryRows, teamRows, availableRoleRows] = await Promise.all([
    summaryRowsPromise,
    teamRowsPromise,
    availableRoleRowsPromise,
  ])

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
    isAdmin: Boolean(member.is_admin),
    inviteStatus: getInviteStatus(member.invite_status, member.invite_expires_at),
    inviteExpiresAt: member.invite_expires_at,
    isCurrentUser: member.user_id === auth.userId,
  }))

  const currentMember = team.find((member) => member.isCurrentUser)
  const canManageUsers = hasRoleSystem
    ? currentMember?.permissions?.some((permission) => permission.code === "users.manage") ?? false
    : currentMember?.platformRole === "ADMIN" || currentMember?.platformRole === "ORG_OWNER"

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
  await ensureManageTeamUserColumns()

  const rows = await prisma.$queryRaw<TeamMemberLookupRow[]>(Prisma.sql`
    select
      u.user_id,
      u.full_name,
      u.email,
      o.organization_name,
      rp.recruiter_role_id,
      hrr.name as recruiter_role_code,
      null::text as recruiter_role_description,
      latest_invite.status as invite_status,
      latest_invite.expires_at::text as invite_expires_at
    from public.users u
    inner join public.organizations o
      on o.organization_id = u.organization_id
    left join public.recruiter_profiles rp
      on rp.recruiter_id = u.user_id
      and rp.organization_id = u.organization_id
    left join public.hireveri_recruiter_roles hrr
      on hrr.legacy_role_id = rp.recruiter_role_id
    left join lateral (
      select
        case
          when rti.accepted_at is not null or rti.status = 'ACCEPTED' then 'ACCEPTED'
          when rti.expires_at < now() then 'EXPIRED'
          else rti.status
        end as status,
        rti.expires_at
      from public.recruiter_team_invites rti
      where rti.org_id = u.organization_id
        and lower(rti.invited_email) = lower(u.email)
      order by rti.invited_at desc
      limit 1
    ) latest_invite on true
    where u.user_id = ${targetUserId}::uuid
      and u.organization_id = ${auth.organizationId}::uuid
      and u.role in ('RECRUITER', 'ADMIN', 'ORG_OWNER')
      and u.team_removed_at is null
    limit 1
  `)

  return rows[0] ?? null
}

async function createInviteRecord(input: {
  auth: RecruiterAuth
  email: string
  userId: string
  inviteId: string
  roleId: number
  expiresAt: Date
  token: string
  action: "INVITED" | "ADDED_EXISTING" | "RESENT"
}) {
  const tokenHash = sha256(input.token)
  const rows = await prisma.$queryRaw<{ invite_id: string }[]>(Prisma.sql`
    insert into public.recruiter_team_invites (
      invite_id,
      org_id,
      invited_email,
      invited_user_id,
      invited_by,
      role_assigned,
      token_hash,
      expires_at,
      status,
      email_status,
      last_sent_at
    )
    values (
      ${input.inviteId}::uuid,
      ${input.auth.organizationId}::uuid,
      lower(${input.email}),
      ${input.userId}::uuid,
      ${input.auth.userId}::uuid,
      ${input.roleId}::smallint,
      ${tokenHash},
      ${input.expiresAt}::timestamptz,
      'PENDING',
      'PENDING',
      null
    )
    returning invite_id::text
  `)

  const inviteId = rows[0]?.invite_id

  if (!inviteId) {
    throw new ApiError(500, "INVITE_CREATE_FAILED", "Failed to create team invite")
  }

  await prisma.$executeRaw(Prisma.sql`
    insert into public.recruiter_team_invite_audit_logs (
      invite_id,
      invited_by,
      role_assigned,
      org_id,
      invited_email,
      action,
      metadata
    )
    values (
      ${inviteId}::uuid,
      ${input.auth.userId}::uuid,
      ${input.roleId}::smallint,
      ${input.auth.organizationId}::uuid,
      lower(${input.email}),
      ${input.action},
      jsonb_build_object('email_status', 'PENDING')
    )
  `)

  return inviteId
}

async function markInviteEmailSent(inviteId: string) {
  await prisma.$executeRaw(Prisma.sql`
    update public.recruiter_team_invites
    set
      email_status = 'SENT',
      last_sent_at = now(),
      updated_at = now()
    where invite_id = ${inviteId}::uuid
  `)
}

async function markInviteEmailFailed(inviteId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown email delivery error"

  await prisma.$executeRaw(Prisma.sql`
    update public.recruiter_team_invites
    set
      email_status = 'FAILED',
      updated_at = now()
    where invite_id = ${inviteId}::uuid
  `)

  await prisma.$executeRaw(Prisma.sql`
    insert into public.recruiter_team_invite_audit_logs (
      invite_id,
      invited_by,
      role_assigned,
      org_id,
      invited_email,
      action,
      metadata
    )
    select
      invite_id,
      invited_by,
      role_assigned,
      org_id,
      invited_email,
      'EMAIL_FAILED',
      jsonb_build_object('error', ${message})
    from public.recruiter_team_invites
    where invite_id = ${inviteId}::uuid
  `)
}

async function rollbackNewPendingUser(input: { userId: string; inviteId: string; auth: RecruiterAuth }) {
  await prisma.$executeRaw(Prisma.sql`
    delete from public.recruiter_team_invites
    where invite_id = ${input.inviteId}::uuid
      and org_id = ${input.auth.organizationId}::uuid
  `)

  await prisma.$executeRaw(Prisma.sql`
    delete from public.recruiter_profiles
    where recruiter_id = ${input.userId}::uuid
      and organization_id = ${input.auth.organizationId}::uuid
  `)

  await prisma.$executeRaw(Prisma.sql`
    delete from public.users
    where user_id = ${input.userId}::uuid
      and organization_id = ${input.auth.organizationId}::uuid
      and is_email_verified = false
      and last_login_at is null
  `)
}

function getSetupLink(token: string) {
  const url = new URL("/api/team-invite/accept", getRecruiterAppUrl())
  url.searchParams.set("setupToken", token)
  return url.toString()
}

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const data = await getTeamWorkspace(auth)

    const response = NextResponse.json({
      success: true,
      data,
    })
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60")
    return response
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

    await assertCanManageUsers(auth)
    await ensureManageTeamUserColumns()
    await ensureTeamInviteTables()

    const [role, actor, existingUser] = await Promise.all([
      getRoleOrThrow(recruiterRoleId),
      getActor(auth),
      getExistingUserByEmail(email),
    ])
    const organizationRows = await prisma.$queryRaw<{ organization_name: string | null }[]>(Prisma.sql`
      select organization_name
      from public.organizations
      where organization_id = ${auth.organizationId}::uuid
      limit 1
    `)
    const organizationName = organizationRows[0]?.organization_name ?? "HireVeri"
    const roleName = role.code || "Organization Role"
    const inviterName = actor?.full_name || actor?.email || "Your team admin"
    const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000)
    const inviteId = randomUUID()
    const token = createInviteToken(inviteId, expiresAt)
    const setupLink = getSetupLink(token)
    const workspaceLink = `${getRecruiterAppUrl().replace(/\/$/, "")}/`
    const createdNew = !existingUser
    const targetUserId = existingUser?.user_id ?? randomUUID()

    if (existingUser && existingUser.organization_id !== auth.organizationId) {
      throw new ApiError(409, "EMAIL_BELONGS_TO_DIFFERENT_ORGANIZATION", "This email already belongs to another organization workspace.")
    }

    let inviteCreated = false

    try {
      if (createdNew) {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw(Prisma.sql`
            insert into public.users (
              user_id,
              organization_id,
              full_name,
              email,
              role,
              is_active,
              is_email_verified,
              created_at
            )
            values (
              ${targetUserId}::uuid,
              ${auth.organizationId}::uuid,
              ${fullName},
              lower(${email}),
              'RECRUITER',
              false,
              false,
              now()
            )
          `)

          await tx.$executeRaw(Prisma.sql`
            insert into public.recruiter_profiles (
              recruiter_id,
              company_name,
              recruiter_role_id,
              organization_id
            )
            values (
              ${targetUserId}::uuid,
              ${organizationName},
              ${recruiterRoleId}::smallint,
              ${auth.organizationId}::uuid
            )
            on conflict (recruiter_id) do update
            set
              company_name = excluded.company_name,
              recruiter_role_id = excluded.recruiter_role_id,
              organization_id = excluded.organization_id
          `)
        })
      } else {
        await prisma.$executeRaw(Prisma.sql`
          update public.users
          set
            full_name = coalesce(nullif(${fullName}, ''), full_name),
            is_active = true,
            team_removed_at = null
          where user_id = ${targetUserId}::uuid
            and organization_id = ${auth.organizationId}::uuid
        `)

        await prisma.$executeRaw(Prisma.sql`
          insert into public.recruiter_profiles (
            recruiter_id,
            company_name,
            recruiter_role_id,
            organization_id
          )
          values (
            ${targetUserId}::uuid,
            ${organizationName},
            ${recruiterRoleId}::smallint,
            ${auth.organizationId}::uuid
          )
          on conflict (recruiter_id) do update
          set
            company_name = excluded.company_name,
            recruiter_role_id = excluded.recruiter_role_id,
            organization_id = excluded.organization_id
        `)
      }

      await createInviteRecord({
        auth,
        email,
        userId: targetUserId,
        inviteId,
        roleId: recruiterRoleId,
        expiresAt,
        token,
        action: createdNew ? "INVITED" : "ADDED_EXISTING",
      })
      inviteCreated = true

      if (createdNew) {
        await sendRecruiterOnboardingEmail({
          to: email,
          name: fullName,
          organization: organizationName,
          role: roleName,
          inviterName,
          link: setupLink,
          expiresAt,
        })
      } else {
        await sendRecruiterOrganizationAddedEmail({
          to: email,
          name: existingUser.full_name || fullName,
          organization: organizationName,
          role: roleName,
          inviterName,
          link: workspaceLink,
        })
      }

      await markInviteEmailSent(inviteId)
    } catch (inviteError) {
      if (inviteCreated) {
        await markInviteEmailFailed(inviteId, inviteError).catch(() => null)
      }

      if (createdNew) {
        await rollbackNewPendingUser({ userId: targetUserId, inviteId, auth }).catch(() => null)
      }

      throw new ApiError(502, "INVITATION_EMAIL_FAILED", "Could not send invitation email. No pending invite was left active.")
    }

    const data = await getTeamWorkspace(auth)

    return NextResponse.json(
      {
        success: true,
        data,
        createdUser: {
          userId: targetUserId,
          recruiterRoleId,
          createdNew,
          inviteStatus: createdNew ? "Pending" : "Accepted",
          emailSent: true,
        },
        message: "Invitation sent successfully",
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

    if (targetUserId === auth.userId && ["disable-member", "remove-member"].includes(action)) {
      throw new ApiError(400, "SELF_ACCESS_CHANGE_BLOCKED", "You cannot disable or remove your own access")
    }

    if (action === "resend-invite") {
      await ensureTeamInviteTables()
      const teamMember = await getTeamMemberForAccessEmail(auth, targetUserId)

      if (!teamMember) {
        throw new ApiError(404, "TEAM_MEMBER_NOT_FOUND", "Team member not found in this organization")
      }

      const roleId = teamMember.recruiter_role_id
      if (!roleId) {
        throw new ApiError(400, "ROLE_NOT_ASSIGNED", "Assign an organization role before resending an invite")
      }

      const actor = await getActor(auth)
      const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000)
      const inviteId = randomUUID()
      const token = createInviteToken(inviteId, expiresAt)
      const setupLink = getSetupLink(token)
      const workspaceLink = `${getRecruiterAppUrl().replace(/\/$/, "")}/`
      const inviteStatus = getInviteStatus(teamMember.invite_status, teamMember.invite_expires_at)
      const organization = teamMember.organization_name ?? "HireVeri"
      const roleName = teamMember.recruiter_role_code || "Organization Role"
      const inviterName = actor?.full_name || actor?.email || "Your team admin"

      await createInviteRecord({
        auth,
        email: teamMember.email,
        userId: teamMember.user_id,
        inviteId,
        roleId,
        expiresAt,
        token,
        action: "RESENT",
      })

      try {
        if (inviteStatus === "Accepted") {
          await sendRecruiterOrganizationAddedEmail({
            to: teamMember.email,
            name: teamMember.full_name ?? teamMember.email,
            organization,
            role: roleName,
            inviterName,
            link: workspaceLink,
          })
        } else {
          await sendRecruiterOnboardingEmail({
            to: teamMember.email,
            name: teamMember.full_name ?? teamMember.email,
            organization,
            role: roleName,
            inviterName,
            link: setupLink,
            expiresAt,
          })
        }

        await markInviteEmailSent(inviteId)
      } catch (emailError) {
        await markInviteEmailFailed(inviteId, emailError).catch(() => null)
        throw new ApiError(502, "INVITATION_EMAIL_FAILED", "Could not resend invitation email. Please retry.")
      }

      return NextResponse.json({
        success: true,
        message: "Invitation sent successfully",
      })
    }

    if (action === "disable-member" || action === "enable-member" || action === "remove-member") {
      await assertCanManageUsers(auth)
      await ensureManageTeamUserColumns()

      const isRemoving = action === "remove-member"
      const isActive = action === "enable-member"

      const result = await prisma.$queryRaw<{ user_id: string }[]>(Prisma.sql`
        update public.users
        set
          is_active = ${isActive},
          team_removed_at = ${isRemoving ? Prisma.sql`now()` : Prisma.sql`null`}
        where user_id = ${targetUserId}::uuid
          and organization_id = ${auth.organizationId}::uuid
          and role in ('RECRUITER', 'ADMIN', 'ORG_OWNER')
          and (
            ${isRemoving}
            or team_removed_at is null
          )
        returning user_id::text
      `)

      if (!result[0]?.user_id) {
        throw new ApiError(404, "TEAM_MEMBER_NOT_FOUND", "Team member not found in this organization")
      }

      if (isRemoving) {
        await prisma.$executeRaw(Prisma.sql`
          update public.recruiter_team_invites
          set
            status = 'REVOKED',
            updated_at = now()
          where org_id = ${auth.organizationId}::uuid
            and invited_user_id = ${targetUserId}::uuid
            and status in ('PENDING', 'RESENT')
        `).catch(() => null)
      }

      const data = await getTeamWorkspace(auth)

      return NextResponse.json({
        success: true,
        data,
        message: isRemoving
          ? "Team member removed successfully"
          : isActive
            ? "Team member enabled successfully"
            : "Team member disabled successfully",
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



