import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { prisma } from "@/lib/server/prisma"

type PipelineFunctionRow = {
  fn_get_dashboard_pipeline: {
    pipeline?: {
      pending?: number
      inProgress?: number
      completed?: number
      flagged?: number
    }
    pendingInterviews?: Array<Record<string, unknown>>
    recordedInterviews?: Array<Record<string, unknown>>
  }
}

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin

    const rows = await prisma.$queryRaw<PipelineFunctionRow[]>(Prisma.sql`
      select public.fn_get_dashboard_pipeline(
        ${auth.organizationId}::uuid,
        ${appUrl}
      )
    `)

    const payload = rows[0]?.fn_get_dashboard_pipeline ?? {}

    return NextResponse.json({
      success: true,
      data: {
        pipeline: payload.pipeline ?? {
          pending: 0,
          inProgress: 0,
          completed: 0,
          flagged: 0,
        },
        pendingInterviews: payload.pendingInterviews ?? [],
        recordedInterviews: payload.recordedInterviews ?? [],
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
