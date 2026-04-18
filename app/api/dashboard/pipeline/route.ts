import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { getInterviewAppUrl } from "@/lib/server/interview-url"
import { prisma } from "@/lib/server/prisma"
import { errorResponse } from "@/lib/server/response"
import { getDashboardPipelineData } from "@/lib/server/services/dashboard-pipeline"

type RecordedFunctionRow = {
  fn_get_dashboard_pipeline: {
    recordedInterviews?: Array<Record<string, unknown>>
  }
}

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const appUrl = getInterviewAppUrl()
    const pipelineData = await getDashboardPipelineData({
      organizationId: auth.organizationId,
    })

    const rows = await prisma.$queryRaw<RecordedFunctionRow[]>(Prisma.sql`
      select public.fn_get_dashboard_pipeline(
        ${auth.organizationId}::uuid,
        ${appUrl}
      )
    `)

    const payload = rows[0]?.fn_get_dashboard_pipeline ?? {}

    return NextResponse.json({
      success: true,
      data: {
        pipeline: pipelineData.pipeline,
        pendingInterviews: pipelineData.pendingInterviews,
        recordedInterviews: payload.recordedInterviews ?? [],
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
