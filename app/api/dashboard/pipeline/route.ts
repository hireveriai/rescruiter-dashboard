import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { getDashboardPipelineData } from "@/lib/server/services/dashboard-pipeline"
import { getDashboardRecordings } from "@/lib/server/services/dashboard-recordings"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const [pipelineData, recordedInterviews] = await Promise.all([
      getDashboardPipelineData({
        organizationId: auth.organizationId,
      }),
      getDashboardRecordings(auth.organizationId),
    ])

    return NextResponse.json({
      success: true,
      data: {
        pipeline: pipelineData.pipeline,
        pendingInterviews: pipelineData.pendingInterviews,
        recordedInterviews,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
