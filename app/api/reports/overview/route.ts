import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse, successResponse } from "@/lib/server/response"
import { getReportsOverview } from "@/lib/server/services/reports.service"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const data = await getReportsOverview(auth.organizationId)
    return successResponse(data)
  } catch (error) {
    return errorResponse(error)
  }
}
