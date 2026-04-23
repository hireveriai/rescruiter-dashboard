import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { runRoleEngineHarness } from "@/lib/server/ai/role-engine-harness"
import { errorResponse, successResponse } from "@/lib/server/response"

export async function GET(request: Request) {
  try {
    await getRecruiterRequestContext(request)
    const report = await runRoleEngineHarness()
    return successResponse(report)
  } catch (error) {
    return errorResponse(error)
  }
}
