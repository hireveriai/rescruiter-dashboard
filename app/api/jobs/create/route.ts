import { createJob } from "@/lib/server/services/jobs"
import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse, successResponse } from "@/lib/server/response"
import { createJobSchema } from "@/lib/server/validators"

export async function POST(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const payload = createJobSchema.parse(await request.json())
    const result = await createJob({
      ...payload,
      organization_id: auth.organizationId,
    })
    return successResponse(result, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
