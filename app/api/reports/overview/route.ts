import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse, successResponse } from "@/lib/server/response"
import { getReportsScreenData } from "@/lib/server/services/recruiter-screen-data"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const data = await getReportsScreenData(auth)
    const response = successResponse(data)
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60")
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
