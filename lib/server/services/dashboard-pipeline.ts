import { getInterviewAppUrl } from "@/lib/server/interview-url"
import { prisma } from "@/lib/server/prisma"
import { deriveInterviewStatus, isInviteUsable } from "@/lib/server/services/interview-status"
import { ensureInterviewRecoverySchema } from "@/lib/server/services/interview-recovery"

type DashboardPipelineOptions = {
  organizationId: string
}

type DashboardPipelineItem = {
  inviteId: string
  link: string
  candidateName: string
  jobTitle: string
  accessType: string
  startTime: Date | string | null
  endTime: Date | string | null
  expiresAt: Date | string | null
  createdAt: Date | string | null
  interviewId: string
  status: string | null
  questionStatus: string | null
  emailStatus: string | null
  failureReason: string | null
  lastError: string | null
  recovery?: {
    available: boolean
    reason: string | null
    completionPercentage: number
    attemptId: string
    timerRemainingSeconds: number | null
  } | null
}

type DashboardPipelineData = {
  pipeline: {
    pending: number
    inProgress: number
    completed: number
    flagged: number
  }
  pendingInterviews: DashboardPipelineItem[]
}

export async function getDashboardPipelineData(
  options: DashboardPipelineOptions
): Promise<DashboardPipelineData> {
  await ensureInterviewRecoverySchema()
  const appUrl = getInterviewAppUrl().replace(/\/$/, "")

  const interviews = await prisma.interview.findMany({
    where: {
      organizationId: options.organizationId,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      candidate: {
        select: {
          fullName: true,
        },
      },
      job: {
        select: {
          jobTitle: true,
        },
      },
      interviewInvites: {
        orderBy: {
          createdAt: "desc",
        },
        select: {
          inviteId: true,
          token: true,
          accessType: true,
          startTime: true,
          endTime: true,
          expiresAt: true,
          createdAt: true,
          status: true,
          usedAt: true,
        },
      },
      attempts: {
        orderBy: {
          startedAt: "desc",
        },
        select: {
          attemptId: true,
          startedAt: true,
          endedAt: true,
          status: true,
        },
      },
    },
  })

  const pendingInterviews: DashboardPipelineItem[] = []
  const recoveryRows = await prisma.$queryRaw<
    Array<{
      interview_id: string
      attempt_id: string
      status: string | null
      interruption_reason: string | null
      completion_percentage: string | number | null
      timer_remaining_seconds: number | null
      attempt_number: number
      max_attempts: number | null
      recovery_allowed: boolean | null
      recovery_used: boolean | null
    }>
  >`
    select
      i.interview_id::text,
      ia.attempt_id::text,
      ia.status,
      ia.interruption_reason,
      ia.completion_percentage,
      ia.timer_remaining_seconds,
      ia.attempt_number,
      i.max_attempts,
      i.recovery_allowed,
      i.recovery_used
    from public.interviews i
    join lateral (
      select *
      from public.interview_attempts latest
      where latest.interview_id = i.interview_id
      order by latest.attempt_number desc, latest.started_at desc
      limit 1
    ) ia on true
    where i.organization_id = ${options.organizationId}::uuid
      and upper(coalesce(ia.status, '')) in ('INTERRUPTED', 'RECOVERY_ALLOWED')
  `
  const recoveryByInterview = new Map(
    recoveryRows.map((row) => {
      const completionRaw = Number(row.completion_percentage ?? 0)
      const completion = completionRaw > 1 ? completionRaw : completionRaw * 100
      return [
        row.interview_id,
        {
          available:
            Boolean(row.recovery_allowed) &&
            !row.recovery_used &&
            row.attempt_number < Math.max(row.max_attempts ?? 2, 1),
          reason: row.interruption_reason,
          completionPercentage: Math.round(completion),
          attemptId: row.attempt_id,
          timerRemainingSeconds: row.timer_remaining_seconds,
        },
      ]
    })
  )
  let pending = 0
  let inProgress = 0
  let completed = 0
  let flagged = 0

  interviews.forEach((interview) => {
    const latestInvite = interview.interviewInvites[0] ?? null
    const latestAttempt = interview.attempts[0] ?? null
    const normalizedInterviewStatus = String(interview.status ?? "").toUpperCase()
    const normalizedEmailStatus = String(interview.emailStatus ?? "").toUpperCase()
    const displayStatus = deriveInterviewStatus({
      interviewStatus: interview.status,
      questionStatus: interview.questionStatus,
      emailStatus: interview.emailStatus,
      latestAttempt,
      latestInvite,
    })
    const normalizedDisplayStatus = String(displayStatus).toUpperCase()
    const recovery = recoveryByInterview.get(interview.interviewId) ?? null

    if (normalizedDisplayStatus === "FLAGGED") {
      flagged += 1
      return
    }

    if (recovery) {
      pending += 1
      pendingInterviews.push({
        inviteId: latestInvite?.inviteId ?? recovery.attemptId,
        link: latestInvite?.token ? `${appUrl}/interview/${latestInvite.token}` : "",
        interviewId: interview.interviewId,
        candidateName: interview.candidate?.fullName ?? "-",
        jobTitle: interview.job?.jobTitle ?? "-",
        accessType: "RECOVERY",
        startTime: latestInvite?.startTime ?? null,
        endTime: latestInvite?.endTime ?? null,
        expiresAt: latestInvite?.expiresAt ?? null,
        createdAt: latestInvite?.createdAt ?? interview.createdAt,
        status: "INTERRUPTED",
        questionStatus: interview.questionStatus ?? null,
        emailStatus: interview.emailStatus ?? null,
        failureReason: interview.failureReason ?? null,
        lastError: interview.lastError ?? null,
        recovery,
      })
      return
    }

    if (normalizedDisplayStatus === "PREPARATION_FAILED") {
      flagged += 1
      pendingInterviews.push({
        inviteId: latestInvite?.inviteId ?? interview.interviewId,
        link: latestInvite?.token ? `${appUrl}/interview/${latestInvite.token}` : "",
        interviewId: interview.interviewId,
        candidateName: interview.candidate?.fullName ?? "-",
        jobTitle: interview.job?.jobTitle ?? "-",
        accessType: latestInvite?.accessType ?? "FLEXIBLE",
        startTime: latestInvite?.startTime ?? null,
        endTime: latestInvite?.endTime ?? null,
        expiresAt: latestInvite?.expiresAt ?? null,
        createdAt: latestInvite?.createdAt ?? interview.createdAt,
        status: "PREPARATION_FAILED",
        questionStatus: interview.questionStatus ?? null,
        emailStatus: interview.emailStatus ?? null,
        failureReason: interview.failureReason ?? null,
        lastError: interview.lastError ?? null,
      })
      return
    }

    if (normalizedDisplayStatus === "COMPLETED") {
      completed += 1
      return
    }

    if (normalizedDisplayStatus === "IN_PROGRESS") {
      inProgress += 1
      return
    }

    pending += 1

    if (normalizedInterviewStatus === "READY" && latestInvite && isInviteUsable(latestInvite)) {
      pendingInterviews.push({
        inviteId: latestInvite.inviteId,
        link: `${appUrl}/interview/${latestInvite.token}`,
        interviewId: interview.interviewId,
        candidateName: interview.candidate?.fullName ?? "-",
        jobTitle: interview.job?.jobTitle ?? "-",
        accessType: latestInvite.accessType ?? "FLEXIBLE",
        startTime: latestInvite.startTime,
        endTime: latestInvite.endTime,
        expiresAt: latestInvite.expiresAt,
        createdAt: latestInvite.createdAt ?? interview.createdAt,
        status: normalizedEmailStatus === "FAILED" ? "EMAIL_FAILED" : normalizedEmailStatus === "SENDING" ? "SENDING_EMAIL" : "READY",
        questionStatus: interview.questionStatus ?? null,
        emailStatus: interview.emailStatus ?? null,
        failureReason: interview.failureReason ?? null,
        lastError: interview.lastError ?? null,
      })
    }
  })

  return {
    pipeline: {
      pending,
      inProgress,
      completed,
      flagged,
    },
    pendingInterviews,
  }
}
