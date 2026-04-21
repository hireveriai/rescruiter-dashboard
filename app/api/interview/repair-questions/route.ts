import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { errorResponse, successResponse } from "@/lib/server/response"
import { repairQuestionsBatch } from "@/lib/server/ai/question-repair"
import { repairInterviewQuestions } from "@/lib/server/services/interview-question-repair"

export async function POST(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const body = await request.json().catch(() => ({}))

    if (Array.isArray(body.questions)) {
      const repaired = await repairQuestionsBatch(
        body.questions.map((item: unknown) => {
          const question = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {}
          return {
            question_text: String(question.question_text ?? question.questionText ?? ""),
            intent: typeof question.intent === "string" ? question.intent : undefined,
            skill: typeof question.skill === "string" ? question.skill : undefined,
          }
        })
      )

      return successResponse(repaired)
    }

    const interviewId = String(body.interviewId ?? body.interview_id ?? "").trim() || undefined
    const jobId = String(body.jobId ?? body.job_id ?? "").trim() || undefined
    const rawLimit = Number(body.limit ?? 50)
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, rawLimit)) : 50
    const force = body.force === undefined ? true : Boolean(body.force)

    if (interviewId && jobId) {
      throw new ApiError(400, "INVALID_REPAIR_SCOPE", "Provide either interviewId or jobId, not both")
    }

    const result = await repairInterviewQuestions({
      organizationId: auth.organizationId,
      interviewId,
      jobId,
      limit,
      force,
    })

    return successResponse(result)
  } catch (error) {
    return errorResponse(error)
  }
}
