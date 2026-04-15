import { NextResponse } from "next/server"

import { ApiError } from "@/lib/server/errors"
import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { prisma } from "@/lib/server/prisma"
import { errorResponse, successResponse } from "@/lib/server/response"
import { generateBaseInterviewQuestionsAI } from "@/lib/server/ai/interview-flow"
import { createInterviewLink } from "@/lib/server/services/interview.service"
import {
  fetchExistingInterviewQuestions,
  replaceInterviewQuestions,
} from "@/lib/server/services/interview-questions"
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
      select: {
        jobId: true,
        jobTitle: true,
        jobDescription: true,
        coreSkills: true,
        experienceLevelId: true,
        interviewDurationMinutes: true,
      },
    })

    if (!job) {
      throw new ApiError(404, "JOB_NOT_FOUND", "Job not found for this organization")
    }

    const result = await createInterviewLink({
      ...payload,
      organizationId: auth.organizationId,
    })

    const useAiQuestions =
      payload.use_ai_generation ?? payload.useAiGeneration ?? payload.use_ai ?? payload.useAi ?? true
    const normalizedApiKey = (process.env.OPENAI_API_KEY ?? "").trim().replace(/^"|"$/g, "")
    const requireAiQuestions =
      payload.require_ai_generation ??
      payload.requireAiGeneration ??
      payload.require_ai ??
      payload.requireAi ??
      (Boolean(normalizedApiKey) && useAiQuestions)

    if (useAiQuestions && result.interviewId) {
      const asyncAi =
        payload.async_ai_generation ?? payload.asyncAiGeneration ?? payload.async_ai ?? payload.asyncAi ?? true

      const runAiGeneration = async () => {
        const existingQuestions = await fetchExistingInterviewQuestions(result.interviewId)
        const resumeSkills = Array.isArray(payload.resume_skills ?? payload.resumeSkills)
          ? (payload.resume_skills ?? payload.resumeSkills)
          : []

        const generated = await generateBaseInterviewQuestionsAI(
          {
            jobDescription: job.jobDescription ?? undefined,
            coreSkills: job.coreSkills ?? [],
            candidateResumeSkills: resumeSkills,
            experienceLevel: String(job.experienceLevelId ?? ""),
            totalQuestions: payload.total_questions ?? payload.totalQuestions,
            interviewDurationMinutes:
              payload.interview_duration_minutes ??
              payload.interviewDurationMinutes ??
              job.interviewDurationMinutes ??
              undefined,
            jobTitle: job.jobTitle ?? undefined,
            previousQuestions: existingQuestions,
            similarityThreshold: payload.similarity_threshold ?? payload.similarityThreshold ?? 0.8,
          },
          { requireAi: requireAiQuestions }
        )

        if (generated.questions.length === 0) {
          console.error("AI generation failed during create-link", {
            error: generated.error_message ?? "unknown",
          })
          return
        }

        const replaced = await replaceInterviewQuestions(result.interviewId, generated.questions)
        if (!replaced) {
          console.error("AI questions generated but could not be saved.")
        }
      }

      if (asyncAi) {
        void runAiGeneration()
      } else {
        await runAiGeneration()
      }
    }

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

    const aiStatus = useAiQuestions ? "completed" : "disabled"
    return successResponse(
      {
        ...result,
        aiStatus,
        emailSent,
        emailError,
      },
      201
    )
  } catch (error) {
    return errorResponse(error)
  }
}
