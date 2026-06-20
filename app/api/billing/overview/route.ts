import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse, successResponse } from "@/lib/server/response"
import { getBillingScreenData } from "@/lib/server/services/recruiter-screen-data"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const billing = await getBillingScreenData(auth)

    const response = successResponse(billing)
    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60")
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
