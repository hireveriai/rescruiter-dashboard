import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse, successResponse } from "@/lib/server/response"
import { getNormalizedReportRows } from "@/lib/server/services/reports.service"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const rows = await getNormalizedReportRows(auth.organizationId)
    return successResponse({
      rows,
      count: rows.length,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    return errorResponse(error)
  }
}
