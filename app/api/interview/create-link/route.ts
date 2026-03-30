import { ApiError } from "@/lib/server/errors"
import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { prisma } from "@/lib/server/prisma"
import { errorResponse, successResponse } from "@/lib/server/response"
import { createInterviewLink } from "@/lib/server/services/interview.service"

export async function POST(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const payload = await request.json()
    const jobId = String(payload.jobId ?? payload.job_id ?? "").trim()

    if (!jobId) {
      throw new ApiError(400, "INVALID_JOB_ID", "jobId is required")
    }

    const job = await prisma.jobPosition.findFirst({
      where: {
        jobId,
        organizationId: auth.organizationId,
      },
      select: { jobId: true },
    })

    if (!job) {
      throw new ApiError(404, "JOB_NOT_FOUND", "Job not found for this organization")
    }

    const result = await createInterviewLink({
      ...payload,
      organizationId: auth.organizationId,
    })

    return successResponse(result, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
