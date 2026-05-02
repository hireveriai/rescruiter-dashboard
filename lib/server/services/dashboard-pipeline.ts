import { getInterviewAppUrl } from "@/lib/server/interview-url"
import { prisma } from "@/lib/server/prisma"
import { isAttemptCompleted, isInviteUsable } from "@/lib/server/services/interview-status"

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
  let pending = 0
  let inProgress = 0
  let completed = 0
  let flagged = 0

  interviews.forEach((interview) => {
    const latestInvite = interview.interviewInvites[0] ?? null
    const latestAttempt = interview.attempts[0] ?? null
    const normalizedInterviewStatus = String(interview.status ?? "").toUpperCase()
    const hasStartedAttempt = Boolean(latestAttempt?.attemptId)
    const completedInterview =
      normalizedInterviewStatus === "COMPLETED" ||
      (latestAttempt ? isAttemptCompleted(latestAttempt) : false)
    const flaggedInterview = normalizedInterviewStatus === "FLAGGED"

    if (flaggedInterview) {
      flagged += 1
    }

    if (completedInterview) {
      completed += 1
      return
    }

    if (hasStartedAttempt) {
      inProgress += 1
      return
    }

    if (latestInvite && isInviteUsable(latestInvite)) {
      pending += 1
      pendingInterviews.push({
        inviteId: latestInvite.inviteId,
        link: `${appUrl}/interview/${latestInvite.token}`,
        candidateName: interview.candidate?.fullName ?? "-",
        jobTitle: interview.job?.jobTitle ?? "-",
        accessType: latestInvite.accessType ?? "FLEXIBLE",
        startTime: latestInvite.startTime,
        endTime: latestInvite.endTime,
        expiresAt: latestInvite.expiresAt,
        createdAt: latestInvite.createdAt ?? interview.createdAt,
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
