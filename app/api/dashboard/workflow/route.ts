import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { getDashboardWorkflowSnapshot } from "@/lib/server/services/dashboard-workflow"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const snapshot = await getDashboardWorkflowSnapshot(auth.organizationId)
    const response = NextResponse.json({
      success: true,
      data: snapshot,
    })

    response.headers.set("Cache-Control", "no-store")
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
