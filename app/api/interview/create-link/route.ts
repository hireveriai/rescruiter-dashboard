import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { ApiError } from "@/lib/server/errors"
import { generateInterviewQuestions } from "@/lib/interview-flow"
import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { prisma } from "@/lib/server/prisma"
import { errorResponse, successResponse } from "@/lib/server/response"
import { parseResumeText } from "@/lib/server/resumeParser"
import { jobPositionsSupportIsActive } from "@/lib/server/services/jobs"
import {
  createInterviewLink,
  getLatestInterviewInviteForEmail,
  recordInterviewInviteTracking,
} from "@/lib/server/services/interview.service"
import { sanitizeSkillList } from "@/lib/server/ai/skills"
import {
  clearInterviewQuestions,
  fetchExistingInterviewQuestions,
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

type ActiveInviteRow = {
  invite_id: string
  interview_id: string
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

async function revokeActiveInvitesForCandidate(params: {
  organizationId: string
  jobId: string
  email: string
}) {
  const activeInvites = await prisma.$queryRaw<ActiveInviteRow[]>(Prisma.sql`
    select
      ii.invite_id,
      ii.interview_id
    from public.interview_invites ii
    inner join public.interviews i on i.interview_id = ii.interview_id
    inner join public.candidates c on c.candidate_id = i.candidate_id
    where i.organization_id = ${params.organizationId}::uuid
      and i.job_id = ${params.jobId}::uuid
      and lower(c.email) = lower(${params.email})
      and coalesce(ii.status, 'ACTIVE') = 'ACTIVE'
      and ii.used_at is null
      and (ii.expires_at is null or ii.expires_at > now())
  `)

  if (activeInvites.length === 0) {
    return
  }

  const inviteIds = activeInvites.map((invite) => invite.invite_id)
  const interviewIds = activeInvites.map((invite) => invite.interview_id)

  await prisma.$executeRaw(Prisma.sql`
    update public.interview_invites
    set
      status = 'EXPIRED',
      expires_at = now()
    where invite_id = any(${inviteIds}::uuid[])
  `)

  await prisma.$executeRaw(Prisma.sql`
    update public.interviews
    set
      is_active = false,
      status = 'EXPIRED'
    where interview_id = any(${interviewIds}::uuid[])
  `)
}

export async function POST(request: Request) {
  try {
    console.log("🚀 USING NEW QUESTION PIPELINE")
    const auth = await getRecruiterRequestContext(request)
    const payload = await request.json()
    const jobId = String(payload.jobId ?? payload.job_id ?? "").trim()
    const candidateId = String(payload.candidateId ?? payload.candidate_id ?? "").trim()
    const confirmDuplicateInvite = payload.confirmDuplicateInvite === true || payload.confirm_duplicate_invite === true

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

    const duplicateInvite = await getLatestInterviewInviteForEmail({
      companyId: auth.organizationId,
      candidateEmail: candidate.email,
    })

    if (duplicateInvite && !confirmDuplicateInvite) {
      return NextResponse.json(
        {
          success: false,
          warning: true,
          lastSentAt: duplicateInvite.lastSentAt,
          message: "Duplicate interview invite detected for this company",
        },
        { status: 409 }
      )
    }

    await revokeActiveInvitesForCandidate({
      organizationId: auth.organizationId,
      jobId,
      email: candidate.email,
    })

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
      const runAiGeneration = async () => {
        const existingQuestions: string[] = []
        const candidateResumeText =
          String(
            payload.candidate_resume_text ??
              payload.candidateResumeText ??
              payload.resume_text ??
              payload.resumeText ??
              candidate.resume_text ??
              ""
          ) || undefined
        const parsedResumeSkills = candidateResumeText
          ? parseResumeText(candidateResumeText).skills ?? []
          : []
        const resumeSkills = Array.isArray(payload.resume_skills ?? payload.resumeSkills)
          ? (payload.resume_skills ?? payload.resumeSkills)
          : parsedResumeSkills

        try {
          console.log("INTERVIEW ID:", result.interviewId)
          const cleared = await clearInterviewQuestions(result.interviewId)
          if (!cleared) {
            throw new Error("Failed to clear existing interview questions")
          }

          const generatedQuestions = await withTimeout(
            generateInterviewQuestions(
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
              }
            ),
            CREATE_LINK_AI_TIMEOUT_MS,
            "AI question generation timed out"
          )
          console.log("GENERATED QUESTIONS:", generatedQuestions)
          if (generatedQuestions.length < MIN_QUESTION_COUNT) {
            throw new Error("Generated too few questions")
          }

          const replaced = await replaceInterviewQuestions(result.interviewId, generatedQuestions)
          if (!replaced) {
            const existingQuestions = await fetchExistingInterviewQuestions(result.interviewId)
            console.error("Generated questions but replacement save failed.", {
              interviewId: result.interviewId,
              existingQuestionCount: existingQuestions.length,
            })
            aiStatus = "save_failed"

            if (existingQuestions.length === 0) {
              throw new ApiError(500, "INTERVIEW_QUESTIONS_SAVE_FAILED", "Generated interview questions could not be saved")
            }

            return
          }

          const verified = await verifyInterviewQuestionsPersisted(result.interviewId, generatedQuestions)
          if (!verified) {
            const existingQuestions = await fetchExistingInterviewQuestions(result.interviewId)
            console.error("Interview questions were replaced but verification failed.", {
              interviewId: result.interviewId,
              existingQuestionCount: existingQuestions.length,
            })
            aiStatus = "verification_failed"

            if (existingQuestions.length === 0) {
              throw new ApiError(
                500,
                "INTERVIEW_QUESTIONS_VERIFY_FAILED",
                "Interview questions were generated but could not be verified after saving"
              )
            }
          }
        } catch (generationError) {
          console.error("Interview question generation failed during create-link", generationError)
          aiStatus = "failed"

          if (generationError instanceof ApiError) {
            throw generationError
          }

          if (requireAiQuestions) {
            throw new ApiError(
              502,
              "AI_GENERATION_REQUIRED",
              generationError instanceof Error ? generationError.message : "AI question generation failed"
            )
          }
        }
      }

      await runAiGeneration()
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

    await recordInterviewInviteTracking({
      interviewId: result.interviewId,
      companyId: auth.organizationId,
      jobId,
      candidateEmail: candidate.email,
    })

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
