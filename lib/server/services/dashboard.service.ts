import { prisma } from "@/lib/server/prisma"

import { deriveInterviewStatus } from "@/lib/server/services/interview-status"
import {
  buildAnswerFallbackSummary,
  deriveResultFromAnswerSummaries,
  fetchAnswerSummaries,
  InterviewAnswerSummary,
} from "@/lib/server/services/interview-summary"

type CandidatesDashboardOptions = {
  organizationId: string
  userId?: string
  limit?: number | "all"
}

type CandidatesDashboardItem = {
  candidateId: string
  interviewId: string | null
  attemptId: string | null
  candidateName: string
  jobTitle: string
  status: string
  score: number | null
  aiSummaryShort: string
  aiSummaryFull: string | null
  decision: string | null
  accessType: string
  startTime: Date | null
  endTime: Date | null
  expiresAt: Date | null
  startedAt: Date | null
  endedAt: Date | null
  createdAt: Date
  answerSummaries: InterviewAnswerSummary[]
}

function getShortSummary(text: string | null): string {
  if (!text) {
    return "-"
  }

  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length <= 20) {
    return words.join(" ")
  }

  return `${words.slice(0, 20).join(" ")}...`
}

async function getRecruiterCreatedCandidateIds(userId?: string): Promise<string[]> {
  if (!userId) {
    return []
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ candidate_id: string }>>`
      select c.candidate_id::text as candidate_id
      from public.candidates c
      where c.created_by::text = ${userId}
    `

    return rows.map((row) => row.candidate_id).filter(Boolean)
  } catch (error) {
    console.warn("Recruiter-created candidate fallback lookup skipped", error)
    return []
  }
}

export async function getCandidatesDashboard(
  options: CandidatesDashboardOptions
): Promise<CandidatesDashboardItem[]> {
  const take = options.limit === "all" || options.limit === undefined ? undefined : options.limit
  const recruiterCreatedCandidateIds = await getRecruiterCreatedCandidateIds(options.userId)

  const candidates = await prisma.candidate.findMany({
    where: {
      OR: [
        { organizationId: options.organizationId },
        ...(recruiterCreatedCandidateIds.length > 0
          ? [{ candidateId: { in: recruiterCreatedCandidateIds } }]
          : []),
      ],
    },
    orderBy: {
      createdAt: "desc",
    },
    ...(take ? { take } : {}),
    include: {
      interviews: {
        orderBy: {
          createdAt: "desc",
        },
        include: {
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
              accessType: true,
              startTime: true,
              endTime: true,
              status: true,
              createdAt: true,
              expiresAt: true,
              usedAt: true,
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
      },
    },
  })

  const attemptIds = candidates
    .map((candidate) => candidate.interviews[0]?.attempts[0]?.attemptId)
    .filter((attemptId): attemptId is string => Boolean(attemptId))
  const answerSummaryMap = await fetchAnswerSummaries(attemptIds)

  return candidates.map((candidate): CandidatesDashboardItem => {
    const latestInterview = candidate.interviews[0] ?? null
    const latestInvite = latestInterview?.interviewInvites[0] ?? null
    const latestAttempt = latestInterview?.attempts[0] ?? null
    const evaluation = latestAttempt?.evaluation ?? null
    const answerSummaries = latestAttempt?.attemptId ? answerSummaryMap.get(latestAttempt.attemptId) ?? [] : []
    const calculatedResult = deriveResultFromAnswerSummaries(answerSummaries)
    const finalScore = evaluation?.finalScore === null || evaluation?.finalScore === undefined ? calculatedResult.score : Number(evaluation.finalScore)
    const aiSummaryFull = evaluation?.aiSummary ?? buildAnswerFallbackSummary(answerSummaries)

    return {
      candidateId: candidate.candidateId,
      interviewId: latestInterview?.interviewId ?? null,
      attemptId: latestAttempt?.attemptId ?? null,
      candidateName: candidate.fullName,
      jobTitle: latestInterview?.job?.jobTitle ?? "-",
      status: latestInterview
        ? deriveInterviewStatus({
            interviewStatus: latestInterview.status,
            latestAttempt,
            latestInvite,
          })
        : candidate.status ?? "PENDING",
      score: finalScore,
      aiSummaryShort: getShortSummary(aiSummaryFull),
      aiSummaryFull,
      decision: evaluation?.decision ?? calculatedResult.decision,
      accessType: latestInvite?.accessType ?? "FLEXIBLE",
      startTime: latestInvite?.startTime ?? null,
      endTime: latestInvite?.endTime ?? null,
      expiresAt: latestInvite?.expiresAt ?? null,
      startedAt: latestAttempt?.startedAt ?? null,
      endedAt: latestAttempt?.endedAt ?? null,
      createdAt: latestInterview?.createdAt ?? candidate.createdAt,
      answerSummaries,
    }
  })
}
