import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { ApiError } from "@/lib/server/errors"
import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { prisma } from "@/lib/server/prisma"
import { errorResponse, successResponse } from "@/lib/server/response"
import { generateBaseInterviewQuestions, generateBaseInterviewQuestionsAI } from "@/lib/server/ai/interview-flow"
import { jobPositionsSupportIsActive } from "@/lib/server/services/jobs"
import { createInterviewLink } from "@/lib/server/services/interview.service"
import { repairInterviewQuestions } from "@/lib/server/services/interview-question-repair"
import { sanitizeSkillList } from "@/lib/server/ai/skills"
import {
  replaceInterviewQuestions,
  verifyInterviewQuestionsPersisted,
} from "@/lib/server/services/interview-questions"
import { sendInterviewEmail } from "@/lib/services/email.service"

type CandidateEmailRow = {
  full_name: string | null
  email: string
  resume_text: string | null
}

type JobDurationRow = {
  interview_duration_minutes: number | null
}

type JobStatusRow = {
  is_active: boolean
}

const CREATE_LINK_AI_TIMEOUT_MS = 12000
const MIN_QUESTION_COUNT = 5

function areSkillListsEquivalent(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  const leftSorted = [...left].map((item) => item.trim().toLowerCase()).sort()
  const rightSorted = [...right].map((item) => item.trim().toLowerCase()).sort()

  return leftSorted.every((value, index) => value === rightSorted[index])
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(timeoutMessage))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const payload = await request.json()
    const jobId = String(payload.jobId ?? payload.job_id ?? "").trim()
    const candidateId = String(payload.candidateId ?? payload.candidate_id ?? "").trim()

    if (!jobId) {
      throw new ApiError(400, "INVALID_JOB_ID", "jobId is required")
    }

    if (!candidateId) {
      throw new ApiError(400, "INVALID_CANDIDATE_ID", "candidateId is required")
    }

    const hasIsActive = await jobPositionsSupportIsActive()

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
      },
    })

    if (!job) {
      throw new ApiError(404, "JOB_NOT_FOUND", "Job not found for this organization")
    }

    const candidateRows = await prisma.$queryRaw<CandidateEmailRow[]>(Prisma.sql`
      select c.full_name, c.email, c.resume_text
      from public.candidates c
      where c.candidate_id = ${candidateId}::uuid
        and c.organization_id = ${auth.organizationId}::uuid
      limit 1
    `)

    const candidate = candidateRows[0]

    if (!candidate?.email) {
      throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Candidate not found for this organization")
    }

    const sanitizedJobSkills = sanitizeSkillList(job.coreSkills ?? [], {
      jobTitle: job.jobTitle ?? undefined,
      jobDescription: job.jobDescription ?? undefined,
    })

    if (!areSkillListsEquivalent(job.coreSkills ?? [], sanitizedJobSkills)) {
      await prisma.$executeRaw(Prisma.sql`
        update public.job_positions
        set core_skills = ${sanitizedJobSkills}::text[]
        where job_id = ${jobId}::uuid
          and organization_id = ${auth.organizationId}::uuid
      `)
    }

    if (hasIsActive) {
      const statusRows = await prisma.$queryRaw<JobStatusRow[]>(Prisma.sql`
        select is_active
        from public.job_positions
        where job_id = ${jobId}::uuid
          and organization_id = ${auth.organizationId}::uuid
        limit 1
      `)

      if (statusRows[0]?.is_active === false) {
        throw new ApiError(409, "JOB_INACTIVE", "This job is inactive and cannot create new interview links")
      }
    }

    const durationRows = await prisma.$queryRaw<JobDurationRow[]>(Prisma.sql`
      select interview_duration_minutes
      from public.job_positions
      where job_id = ${jobId}::uuid
      limit 1
    `)
    const interviewDurationMinutes = durationRows[0]?.interview_duration_minutes ?? undefined

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
    let aiStatus = useAiQuestions ? "completed" : "disabled"

    if (useAiQuestions && result.interviewId) {
      const asyncAi =
        payload.async_ai_generation ?? payload.asyncAiGeneration ?? payload.async_ai ?? payload.asyncAi ?? false

      const runAiGeneration = async () => {
        const existingQuestions: string[] = []
        const resumeSkills = Array.isArray(payload.resume_skills ?? payload.resumeSkills)
          ? (payload.resume_skills ?? payload.resumeSkills)
          : []
        const candidateResumeText =
          String(
            payload.candidate_resume_text ??
              payload.candidateResumeText ??
              payload.resume_text ??
              payload.resumeText ??
              candidate.resume_text ??
              ""
          ) || undefined

        let generatedAi

        try {
          generatedAi = await withTimeout(
            generateBaseInterviewQuestionsAI(
              {
                jobDescription: job.jobDescription ?? undefined,
                coreSkills: sanitizedJobSkills,
                candidateResumeText,
                candidateResumeSkills: resumeSkills,
                candidateId,
                jobId,
                experienceLevel: String(job.experienceLevelId ?? ""),
                totalQuestions: payload.total_questions ?? payload.totalQuestions,
                interviewDurationMinutes:
                  payload.interview_duration_minutes ??
                  payload.interviewDurationMinutes ??
                  interviewDurationMinutes ??
                  undefined,
                jobTitle: job.jobTitle ?? undefined,
                previousQuestions: existingQuestions,
                similarityThreshold: payload.similarity_threshold ?? payload.similarityThreshold ?? 0.8,
              },
              { requireAi: requireAiQuestions }
            ),
            CREATE_LINK_AI_TIMEOUT_MS,
            "AI question generation timed out"
          )
        } catch (generationError) {
          console.error("AI generation timed out or failed during create-link; using fallback generator", generationError)
          generatedAi = {
            questions: [],
            skills_covered: [],
            skills_remaining: [],
            error_message:
              generationError instanceof Error ? generationError.message : "AI question generation timed out",
          }
        }

        const generated =
          generatedAi.questions.length > 0
            ? generatedAi
            : generateBaseInterviewQuestions({
                jobDescription: job.jobDescription ?? undefined,
                coreSkills: sanitizedJobSkills,
                candidateResumeText,
                candidateResumeSkills: resumeSkills,
                candidateId,
                jobId,
                experienceLevel: String(job.experienceLevelId ?? ""),
                totalQuestions: payload.total_questions ?? payload.totalQuestions,
                interviewDurationMinutes:
                  payload.interview_duration_minutes ??
                  payload.interviewDurationMinutes ??
                  interviewDurationMinutes ??
                  undefined,
                jobTitle: job.jobTitle ?? undefined,
                previousQuestions: existingQuestions,
                similarityThreshold: payload.similarity_threshold ?? payload.similarityThreshold ?? 0.8,
              })

        let finalGenerated = generated

        if (generated.questions.length < MIN_QUESTION_COUNT) {
          finalGenerated = generateBaseInterviewQuestions({
            jobDescription: job.jobDescription ?? undefined,
            coreSkills: sanitizedJobSkills,
            candidateResumeText,
            candidateResumeSkills: resumeSkills,
            candidateId,
            jobId,
            experienceLevel: String(job.experienceLevelId ?? ""),
            totalQuestions:
              Math.max(
                MIN_QUESTION_COUNT,
                Number(payload.total_questions ?? payload.totalQuestions ?? 0) || MIN_QUESTION_COUNT
              ),
            interviewDurationMinutes:
              payload.interview_duration_minutes ??
              payload.interviewDurationMinutes ??
              interviewDurationMinutes ??
              undefined,
            jobTitle: job.jobTitle ?? undefined,
            previousQuestions: existingQuestions,
            similarityThreshold: payload.similarity_threshold ?? payload.similarityThreshold ?? 0.8,
          })
          aiStatus = "fallback"
        }

        if (generatedAi.questions.length === 0) {
          console.error("AI generation failed during create-link; used fallback generator", {
            error: generatedAi.error_message ?? "unknown",
          })
          aiStatus = "fallback"
        }

        const replaced = await replaceInterviewQuestions(result.interviewId, finalGenerated.questions)
        if (!replaced) {
          console.error("AI questions generated but could not be saved.")
          aiStatus = "save_failed"
          throw new ApiError(500, "INTERVIEW_QUESTIONS_SAVE_FAILED", "Generated interview questions could not be saved")
        }

        const verified = await verifyInterviewQuestionsPersisted(result.interviewId, finalGenerated.questions)
        if (!verified) {
          console.error("Interview questions were replaced but verification failed.")
          aiStatus = "verification_failed"
          throw new ApiError(
            500,
            "INTERVIEW_QUESTIONS_VERIFY_FAILED",
            "Interview questions were generated but could not be verified after saving"
          )
        }
      }

      const runAutoRepair = async () => {
        try {
          await repairInterviewQuestions({
            organizationId: auth.organizationId,
            jobId,
            interviewId: result.interviewId,
            limit: 1,
            force: false,
          })

          // Self-heal a small recent set of legacy interviews for the same job in background
          // so recruiters do not need to run manual repair actions.
          await repairInterviewQuestions({
            organizationId: auth.organizationId,
            jobId,
            limit: 12,
            force: false,
          })
        } catch (repairError) {
          console.error("Automatic interview question repair failed", repairError)
        }
      }

      if (asyncAi) {
        await runAiGeneration()
        void runAutoRepair()
      } else {
        await runAiGeneration()
        void runAutoRepair()
      }
    }

    let emailSent = false
    let emailError: string | null = null

    try {
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
    } catch (emailFailure) {
      console.error("Failed to send interview email", emailFailure)
      emailError = emailFailure instanceof Error ? emailFailure.message : "Unknown email delivery error"
    }

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
