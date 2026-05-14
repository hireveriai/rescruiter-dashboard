import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { getDashboardAlerts } from "@/lib/server/services/dashboard-alerts"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const { searchParams } = new URL(request.url)
    const limit = Math.max(1, Math.min(Number(searchParams.get("limit") || 8) || 8, 25))
    const alerts = await getDashboardAlerts(auth.organizationId, limit)

    return NextResponse.json({
      success: true,
      data: alerts,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
