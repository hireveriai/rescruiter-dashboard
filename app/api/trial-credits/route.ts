import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse, successResponse } from "@/lib/server/response"
import { getOrCreateTrialCredits } from "@/lib/server/services/trial-credits"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const credits = await getOrCreateTrialCredits(auth.organizationId)

    return successResponse(credits)
  } catch (error) {
    return errorResponse(error)
  }
}
