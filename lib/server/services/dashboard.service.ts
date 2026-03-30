import { prisma } from "@/lib/server/prisma"

type CandidatesDashboardOptions = {
  organizationId: string
  limit?: number | "all"
}

type CandidatesDashboardItem = {
  candidateName: string
  jobTitle: string
  status: string
  score: number | null
  aiSummaryShort: string
  aiSummaryFull: string | null
  decision: string | null
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

export async function getCandidatesDashboard(
  options: CandidatesDashboardOptions
): Promise<CandidatesDashboardItem[]> {
  const take = options.limit === "all" || options.limit === undefined ? undefined : options.limit

  const candidates = await prisma.candidate.findMany({
    where: {
      organizationId: options.organizationId,
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
            select: {
              inviteId: true,
              status: true,
              createdAt: true,
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

  return candidates.map((candidate): CandidatesDashboardItem => {
    const latestInterview = candidate.interviews[0] ?? null
    const latestAttempt = latestInterview?.attempts[0] ?? null
    const evaluation = latestAttempt?.evaluation ?? null
    const finalScore = evaluation?.finalScore ? Number(evaluation.finalScore) : null
    const aiSummaryFull = evaluation?.aiSummary ?? null

    return {
      candidateName: candidate.fullName,
      jobTitle: latestInterview?.job?.jobTitle ?? "-",
      status: latestInterview?.status ?? "PENDING",
      score: finalScore,
      aiSummaryShort: getShortSummary(aiSummaryFull),
      aiSummaryFull,
      decision: evaluation?.decision ?? null,
    }
  })
}
