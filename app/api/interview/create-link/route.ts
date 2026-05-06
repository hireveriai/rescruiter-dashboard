import { NextResponse } from "next/server"
import { Prisma } from "@prisma/client"

import { ApiError } from "@/lib/server/errors"
import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { prisma } from "@/lib/server/prisma"
import { errorResponse, successResponse } from "@/lib/server/response"
import { jobPositionsSupportIsActive } from "@/lib/server/services/jobs"
import {
  getLatestInterviewInviteForEmail,
  recordInterviewInviteTracking,
} from "@/lib/server/services/interview.service"
import { sanitizeSkillList } from "@/lib/server/ai/skills"
import {
  createPreparingInterview,
  markEmailFailed,
  prepareInterviewQuestionsWithRetry,
  sendInterviewEmailForInterview,
} from "@/lib/server/services/interview-workflow"

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

function areSkillListsEquivalent(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  const leftSorted = [...left].map((item) => item.trim().toLowerCase()).sort()
  const rightSorted = [...right].map((item) => item.trim().toLowerCase()).sort()

  return leftSorted.every((value, index) => value === rightSorted[index])
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

    const idempotencyKey = String(
      payload.idempotencyKey ??
        payload.idempotency_key ??
        request.headers.get("Idempotency-Key") ??
        ""
    ).trim() || null

    const result = await createPreparingInterview({
      organizationId: auth.organizationId,
      jobId,
      candidateId,
      accessType: payload.accessType ?? payload.access_type ?? "FLEXIBLE",
      startTime: payload.startTime ?? payload.start_time ?? null,
      endTime: payload.endTime ?? payload.end_time ?? null,
      idempotencyKey,
    })

    const useAiQuestions =
      payload.use_ai_generation ?? payload.useAiGeneration ?? payload.use_ai ?? payload.useAi ?? true

    if (result.reused && result.status !== "READY") {
      return successResponse(
        {
          ...result,
          emailSent: result.emailStatus === "SENT",
          emailError: result.emailStatus === "FAILED" ? result.lastError : null,
        },
        202
      )
    }

    if (!result.reused) {
      if (useAiQuestions) {
        await prepareInterviewQuestionsWithRetry({
          organizationId: auth.organizationId,
          interviewId: result.interviewId,
          candidateResumeText:
            String(
              payload.candidate_resume_text ??
                payload.candidateResumeText ??
                payload.resume_text ??
                payload.resumeText ??
                candidate.resume_text ??
                ""
            ) || undefined,
          resumeSkills: Array.isArray(payload.resume_skills ?? payload.resumeSkills)
            ? (payload.resume_skills ?? payload.resumeSkills)
            : undefined,
          totalQuestions: payload.total_questions ?? payload.totalQuestions,
          interviewDurationMinutes:
            payload.interview_duration_minutes ??
            payload.interviewDurationMinutes ??
            interviewDurationMinutes ??
            undefined,
          similarityThreshold: payload.similarity_threshold ?? payload.similarityThreshold ?? 0.8,
        })
      } else {
        await prisma.$executeRaw(Prisma.sql`
          update public.interviews
          set
            status = 'READY',
            question_status = 'COMPLETED',
            failure_reason = null,
            last_error = null,
            questions_generated_at = now(),
            is_active = true
          where interview_id = ${result.interviewId}::uuid
            and organization_id = ${auth.organizationId}::uuid
        `)
        await prisma.$executeRaw(Prisma.sql`
          update public.interview_invites
          set status = 'ACTIVE'
          where interview_id = ${result.interviewId}::uuid
        `)
      }
    }

    const emailResult =
      result.reused && result.emailStatus === "SENT"
        ? { emailSent: true, emailError: null, link: result.link }
        : await sendInterviewEmailForInterview(auth.organizationId, result.interviewId)

    if (emailResult.emailSent) {
      await recordInterviewInviteTracking({
        interviewId: result.interviewId,
        companyId: auth.organizationId,
        jobId,
        candidateEmail: candidate.email,
      })
    } else {
      await markEmailFailed(auth.organizationId, result.interviewId, emailResult.emailError ?? "Email delivery failed")
    }

    return successResponse(
      {
        ...result,
        status: "READY",
        questionStatus: "COMPLETED",
        emailStatus: emailResult.emailSent ? "SENT" : "FAILED",
        emailSent: emailResult.emailSent,
        emailError: emailResult.emailError,
        link: emailResult.link || result.link,
      },
      201
    )
  } catch (error) {
    return errorResponse(error)
  }
}
