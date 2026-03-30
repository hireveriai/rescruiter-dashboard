import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { prisma } from "@/lib/server/prisma"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)

    const interviews = await prisma.interview.findMany({
      where: {
        organizationId: auth.organizationId,
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
            accessType: true,
            startTime: true,
            endTime: true,
            expiresAt: true,
            status: true,
          },
        },
        attempts: {
          orderBy: {
            startedAt: "desc",
          },
          include: {
            evaluation: true,
          },
        },
      },
    })

    const data = interviews.map((interview) => {
      const latestInvite = interview.interviewInvites[0] ?? null
      const latestAttempt = interview.attempts[0] ?? null
      const evaluation = latestAttempt?.evaluation ?? null

      return {
        interviewId: interview.interviewId,
        candidateName: interview.candidate.fullName,
        jobTitle: interview.job.jobTitle,
        status: interview.status ?? "PENDING",
        accessType: latestInvite?.accessType ?? "FLEXIBLE",
        startTime: latestInvite?.startTime ?? null,
        endTime: latestInvite?.endTime ?? null,
        expiresAt: latestInvite?.expiresAt ?? null,
        score: evaluation?.finalScore ? Number(evaluation.finalScore) : null,
        decision: evaluation?.decision ?? null,
        createdAt: interview.createdAt,
      }
    })

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
