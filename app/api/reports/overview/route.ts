import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse, successResponse } from "@/lib/server/response"
import { getReportsScreenData } from "@/lib/server/services/recruiter-screen-data"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const data = await getReportsScreenData(auth)
    return successResponse(data)
  } catch (error) {
    return errorResponse(error)
  }
}
