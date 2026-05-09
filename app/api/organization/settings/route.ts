import { NextResponse } from "next/server"
import { z } from "zod"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { prisma } from "@/lib/server/prisma"
import { errorResponse } from "@/lib/server/response"
import {
  DEFAULT_ORG_TIMEZONE,
  DEFAULT_ORG_TIMEZONE_LABEL,
  ORG_TIMEZONE_OPTIONS,
} from "@/lib/time/constants"

const payloadSchema = z.object({
  timezone: z.string().trim().min(1),
  timezoneLabel: z.string().trim().min(1).optional(),
})

function resolveTimezoneLabel(timezone: string, timezoneLabel?: string) {
  if (timezoneLabel) {
    return timezoneLabel
  }

  return (
    ORG_TIMEZONE_OPTIONS.find((option) => option.value === timezone)?.label ??
    DEFAULT_ORG_TIMEZONE_LABEL
  )
}

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const rows = await prisma.$queryRaw<Array<{
      timezone: string | null
      timezone_label: string | null
    }>>`
      select timezone, timezone_label
      from public.organizations
      where organization_id = ${auth.organizationId}::uuid
      limit 1
    `

    const organization = rows[0]

    return NextResponse.json({
      success: true,
      data: {
        timezone: organization?.timezone ?? DEFAULT_ORG_TIMEZONE,
        timezoneLabel: organization?.timezone_label ?? DEFAULT_ORG_TIMEZONE_LABEL,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const parsed = payloadSchema.parse(await request.json())
    const timezoneLabel = resolveTimezoneLabel(parsed.timezone, parsed.timezoneLabel)

    await prisma.$executeRaw`
      update public.organizations
      set
        timezone = ${parsed.timezone},
        timezone_label = ${timezoneLabel}
      where organization_id = ${auth.organizationId}::uuid
    `

    return NextResponse.json({
      success: true,
      data: {
        timezone: parsed.timezone,
        timezoneLabel,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
