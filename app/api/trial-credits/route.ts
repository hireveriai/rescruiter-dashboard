import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse, successResponse } from "@/lib/server/response"
import { getOrCreateTrialCredits } from "@/lib/server/services/trial-credits"

export const runtime = "nodejs"

export async function GET(request: Request) {
  let auth: Awaited<ReturnType<typeof getRecruiterRequestContext>>

  try {
    auth = await getRecruiterRequestContext(request)
  } catch (error) {
    return errorResponse(error)
  }

  try {
    const credits = await getOrCreateTrialCredits(auth.organizationId)
    const response = successResponse(credits)
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
    response.headers.set("Pragma", "no-cache")
    return response
  } catch (error) {
    console.error("Trial credits bootstrap failed", error)
    return errorResponse(error)
  }
}
