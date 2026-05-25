import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse, successResponse } from "@/lib/server/response"
import { getOrganizationBillingHistory } from "@/lib/server/services/invoices"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const billing = await getOrganizationBillingHistory(auth)

    return successResponse(billing)
  } catch (error) {
    return errorResponse(error)
  }
}
