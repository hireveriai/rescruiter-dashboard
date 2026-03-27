import { createJob } from "@/lib/server/services/jobs"
import { errorResponse, successResponse } from "@/lib/server/response"
import { createJobSchema } from "@/lib/server/validators"
const DEFAULT_ORG_ID = "11111111-0000-0000-0000-000000000001"; // temp
export async function POST(request: Request) {
  try {
    const payload = createJobSchema.parse(await request.json())
    const result = await createJob(payload)
    return successResponse(result, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
