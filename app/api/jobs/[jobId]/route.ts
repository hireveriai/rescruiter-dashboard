import { NextRequest, NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { errorResponse, successResponse } from "@/lib/server/response"
import { setJobActiveState, updateJob } from "@/lib/server/services/jobs"
import { updateJobSchema } from "@/lib/server/validators"

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ jobId: string }> }
) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const { jobId } = await context.params
    const payload = await request.json()

    if (!jobId) {
      throw new ApiError(400, "INVALID_JOB_ID", "jobId is required")
    }

    if (typeof payload?.is_active === "boolean" && Object.keys(payload).length === 1) {
      const result = await setJobActiveState({
        job_id: jobId,
        organization_id: auth.organizationId,
        is_active: payload.is_active,
      })

      return successResponse(result)
    }

    const parsed = updateJobSchema.parse(payload)
    const result = await updateJob({
      ...parsed,
      job_id: jobId,
      organization_id: auth.organizationId,
    })

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
