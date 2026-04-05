import { ApiError } from "@/lib/server/errors"
import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { prisma } from "@/lib/server/prisma"
import { errorResponse, successResponse } from "@/lib/server/response"
import { createInterviewLink } from "@/lib/server/services/interview.service"
import { sendInterviewEmail } from "@/lib/services/email.service"

type CandidateEmailRow = {
  full_name: string | null
  email: string
}

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

    let emailSent = false
    let emailError: string | null = null

    try {
      const candidateId = String(payload.candidateId ?? payload.candidate_id ?? "").trim()

      if (!candidateId) {
        emailError = "Candidate ID missing for email delivery"
      } else {
        const candidates = await prisma.$queryRaw<CandidateEmailRow[]>`
          select c.full_name, c.email
          from public.candidates c
          where c.candidate_id = ${candidateId}::uuid
            and c.organization_id = ${auth.organizationId}::uuid
          limit 1
        `

        const candidate = candidates[0]

        if (!candidate?.email) {
          emailError = "Candidate email not found"
        } else {
          await sendInterviewEmail({
            to: candidate.email,
            name: candidate.full_name || "Candidate",
            link: result.link,
          })
          emailSent = true
        }
      }
    } catch (emailFailure) {
      console.error("Failed to send interview email", emailFailure)
      emailError = emailFailure instanceof Error ? emailFailure.message : "Unknown email delivery error"
    }

    return successResponse(
      {
        ...result,
        emailSent,
        emailError,
      },
      201
    )
  } catch (error) {
    return errorResponse(error)
  }
}
