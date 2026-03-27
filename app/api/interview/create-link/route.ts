import { createInterviewLink } from "@/lib/server/services/interview.service"
import { errorResponse, successResponse } from "@/lib/server/response"

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const result = await createInterviewLink(payload)
    return successResponse(result, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
