import { createInterviewInvite } from "@/lib/server/services/invite"
import { errorResponse, successResponse } from "@/lib/server/response"
import { inviteInterviewSchema } from "@/lib/server/validators"

export async function POST(request: Request) {
  try {
    const payload = inviteInterviewSchema.parse(await request.json())
    const result = await createInterviewInvite(payload)
    return successResponse(result, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
