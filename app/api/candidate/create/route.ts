import { createCandidate } from "@/lib/server/services/candidate"
import { errorResponse, successResponse } from "@/lib/server/response"
import { createCandidateSchema } from "@/lib/server/validators"

export async function POST(request: Request) {
  try {
    const payload = createCandidateSchema.parse(await request.json())
    const result = await createCandidate(payload)
    return successResponse(result, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
