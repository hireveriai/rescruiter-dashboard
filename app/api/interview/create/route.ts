import { createInterviewConfig } from "@/lib/server/services/interview-config"
import { errorResponse, successResponse } from "@/lib/server/response"
import { createInterviewConfigSchema } from "@/lib/server/validators"

export async function POST(request: Request) {
  try {
    const payload = createInterviewConfigSchema.parse(await request.json())
    const result = await createInterviewConfig(payload)
    return successResponse(result, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
