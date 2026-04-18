import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"

type SkillProfileRow = {
  attempt_id: string
  skill_scores: Record<string, { average?: number; bucket?: string; samples?: number }>
  overall_weighted_score: number | null
}

type CacheEntry = {
  value: ReportsPayload
  expiresAt: number
}

type MetricCard = {
  label: string
  value: number
  helper: string
}

type FunnelStage = {
  key: string
  label: string
  count: number
  conversionRate: number
  dropOffRate: number
}

type TimelineEvent = {
  id: string
  at: string
  title: string
  detail: string
  severity: "info" | "warning" | "critical"
  recordingUrl: string | null
}

type FraudSignalCard = {
  label: string
  value: number
  helper: string
}

type RankingRow = {
  rank: number
  candidateName: string
  jobTitle: string
  score: number
  recommendation: string
  riskLevel: string
  attemptId: string
}

type RoleInsightRow = {
  jobId: string
  jobTitle: string
  averageScore: number
  completedInterviews: number
  flaggedInterviews: number
  selectedCandidates: number
  failureTrend: string
  skillGaps: string[]
}

type AuditLogRow = {
  id: string
  at: string
  actor: string
  action: string
  target: string
  source: string
  detail: string
}

export type ReportsPayload = {
  generatedAt: string
  executiveSummary: {
    totalCandidates: number
    completedInterviews: number
    flaggedCandidates: number
    recommendedHires: number
    dropOffRate: number
    cards: MetricCard[]
  }
  interviewFunnel: {
    stages: FunnelStage[]
  }
  cognitiveRisk: {
    confidenceScore: number
    stressIndex: number
    clarityIndex: number
    suspicionIndex: number
    behavioralAnomalies: number
    narrative: string
  }
  interviewTimeline: TimelineEvent[]
  fraudDetection: {
    cards: FraudSignalCard[]
    suspiciousPatterns: string[]
  }
  candidateRanking: RankingRow[]
  roleInsights: RoleInsightRow[]
  auditLogs: AuditLogRow[]
}

const REPORTS_CACHE_TTL_MS = 30_000
const reportsCache = new Map<string, CacheEntry>()

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase()
}

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function percentage(part: number, total: number) {
  if (!total) {
    return 0
  }

  return Number(((part / total) * 100).toFixed(1))
}

function average(values: number[]) {
  if (!values.length) {
    return 0
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
}

function buildNarrative(params: {
  confidenceScore: number
  suspicionIndex: number
  clarityIndex: number
  stressIndex: number
  flaggedCandidates: number
}) {
  const confidenceLabel =
    params.confidenceScore >= 75 ? "high-confidence responses" : params.confidenceScore >= 55 ? "mixed confidence" : "fragile confidence"
  const suspicionLabel =
    params.suspicionIndex >= 60 ? "elevated forensic scrutiny" : params.suspicionIndex >= 35 ? "moderate scrutiny" : "low observed suspicion"

  return `Current interviews show ${confidenceLabel}, ${suspicionLabel}, and a clarity-to-stress balance of ${params.clarityIndex}/${params.stressIndex}. ${params.flaggedCandidates} candidate${params.flaggedCandidates === 1 ? "" : "s"} are currently routed into flagged review.`
}

async function fetchSkillProfiles(attemptIds: string[]) {
  if (attemptIds.length === 0) {
    return new Map<string, SkillProfileRow>()
  }

  const rows = await prisma.$queryRaw<SkillProfileRow[]>(Prisma.sql`
    select
      attempt_id::text as attempt_id,
      skill_scores,
      overall_weighted_score
    from public.interview_skill_profiles
    where attempt_id in (${Prisma.join(attemptIds.map((id) => Prisma.sql`${id}::uuid`))})
  `).catch(() => [] as SkillProfileRow[])

  return new Map(rows.map((row) => [row.attempt_id, row]))
}

async function loadReportsData(organizationId: string): Promise<ReportsPayload> {
  const interviews = await prisma.interview.findMany({
    where: {
      organizationId,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      candidate: {
        select: {
          candidateId: true,
          fullName: true,
          email: true,
        },
      },
      job: {
        select: {
          jobId: true,
          jobTitle: true,
        },
      },
      interviewInvites: {
        orderBy: {
          createdAt: "desc",
        },
        select: {
          inviteId: true,
          createdAt: true,
          expiresAt: true,
          usedAt: true,
          status: true,
          accessType: true,
          startTime: true,
          endTime: true,
          issuedBy: true,
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
          evaluation: {
            select: {
              finalScore: true,
              decision: true,
              aiSummary: true,
              createdAt: true,
            },
          },
        },
      },
    },
  })

  const attemptIds = interviews.flatMap((interview) => interview.attempts.map((attempt) => attempt.attemptId))
  const skillProfiles = await fetchSkillProfiles(attemptIds)

  const candidateIds = new Set<string>()
  let invited = 0
  let started = 0
  let completed = 0
  let flagged = 0
  let selected = 0
  let recommendedHires = 0

  const confidenceSeries: number[] = []
  const claritySeries: number[] = []
  const stressSeries: number[] = []
  const suspicionSeries: number[] = []
  const rankingRows: RankingRow[] = []
  const timelineEvents: TimelineEvent[] = []
  const auditLogs: AuditLogRow[] = []
  const roleMap = new Map<
    string,
    {
      jobId: string
      jobTitle: string
      scores: number[]
      flagged: number
      completed: number
      selected: number
      skillGaps: Map<string, number>
    }
  >()

  interviews.forEach((interview) => {
    candidateIds.add(interview.candidate.candidateId)

    const latestInvite = interview.interviewInvites[0] ?? null
    const latestAttempt = interview.attempts[0] ?? null
    const latestEvaluation = latestAttempt?.evaluation ?? null
    const profile = latestAttempt ? skillProfiles.get(latestAttempt.attemptId) : null

    const interviewStatus = normalizeStatus(interview.status)
    const attemptStatus = normalizeStatus(latestAttempt?.status)
    const decision = normalizeStatus(latestEvaluation?.decision)
    const score = toNumber(latestEvaluation?.finalScore) ?? toNumber(profile?.overall_weighted_score)
    const isCompleted = interviewStatus === "COMPLETED" || attemptStatus === "COMPLETED" || Boolean(latestAttempt?.endedAt)
    const isStarted = Boolean(latestAttempt?.attemptId)
    const isFlagged = interviewStatus === "FLAGGED"
    const isSelected = decision === "HIRE" || decision === "SELECTED"
    const isRecommendedHire = isSelected || (score !== null && score >= 80)

    if (latestInvite) {
      invited += 1
      timelineEvents.push({
        id: `invite-${latestInvite.inviteId}`,
        at: latestInvite.createdAt.toISOString(),
        title: "Interview invite issued",
        detail: `${interview.candidate.fullName} received ${String(latestInvite.accessType ?? "Flexible").toLowerCase()} access for ${interview.job.jobTitle}.`,
        severity: "info",
        recordingUrl: null,
      })
      auditLogs.push({
        id: `audit-invite-${latestInvite.inviteId}`,
        at: latestInvite.createdAt.toISOString(),
        actor: latestInvite.issuedBy ? "Recruiter" : "System",
        action: "Invite Created",
        target: interview.candidate.fullName,
        source: "Interview Access",
        detail: `${interview.job.jobTitle} - ${String(latestInvite.accessType ?? "Flexible").toUpperCase()}`,
      })
    }

    if (isStarted && latestAttempt) {
      started += 1
      timelineEvents.push({
        id: `attempt-start-${latestAttempt.attemptId}`,
        at: latestAttempt.startedAt.toISOString(),
        title: "Interview started",
        detail: `${interview.candidate.fullName} started the interview for ${interview.job.jobTitle}.`,
        severity: "info",
        recordingUrl: null,
      })
      auditLogs.push({
        id: `audit-attempt-${latestAttempt.attemptId}`,
        at: latestAttempt.startedAt.toISOString(),
        actor: interview.candidate.fullName,
        action: "Interview Started",
        target: interview.job.jobTitle,
        source: "Candidate Session",
        detail: `Attempt ${latestAttempt.attemptId}`,
      })
    }

    if (isCompleted) {
      completed += 1
    }

    if (isFlagged) {
      flagged += 1
      suspicionSeries.push(82)
      timelineEvents.push({
        id: `flagged-${interview.interviewId}`,
        at: (latestAttempt?.endedAt ?? latestAttempt?.startedAt ?? interview.createdAt).toISOString(),
        title: "Interview flagged",
        detail: `${interview.candidate.fullName} entered a flagged review state.`,
        severity: "critical",
        recordingUrl: null,
      })
    }

    if (isSelected) {
      selected += 1
    }

    if (isRecommendedHire) {
      recommendedHires += 1
    }

    if (score !== null) {
      confidenceSeries.push(score)
      claritySeries.push(Math.min(100, Math.round(score * 0.92 + 8)))
      stressSeries.push(Math.max(5, Math.round(100 - score * 0.75)))
      if (!isFlagged) {
        suspicionSeries.push(Math.max(8, Math.round(100 - score)))
      }

      rankingRows.push({
        rank: 0,
        candidateName: interview.candidate.fullName,
        jobTitle: interview.job.jobTitle,
        score,
        recommendation: isSelected ? "Hire" : decision === "HOLD" ? "Hold" : decision === "REJECT" ? "Reject" : score >= 80 ? "Hire" : score >= 60 ? "Hold" : "Reject",
        riskLevel: isFlagged ? "High" : score >= 75 ? "Low" : score >= 60 ? "Medium" : "High",
        attemptId: latestAttempt?.attemptId ?? interview.interviewId,
      })
    }

    if (latestEvaluation?.createdAt) {
      timelineEvents.push({
        id: `evaluation-${latestAttempt?.attemptId ?? interview.interviewId}`,
        at: latestEvaluation.createdAt.toISOString(),
        title: "AI evaluation completed",
        detail: `${interview.candidate.fullName} received a ${decision || "REVIEW"} recommendation.`,
        severity: isFlagged ? "warning" : "info",
        recordingUrl: null,
      })
      auditLogs.push({
        id: `audit-evaluation-${latestAttempt?.attemptId ?? interview.interviewId}`,
        at: latestEvaluation.createdAt.toISOString(),
        actor: "AI Evaluator",
        action: "Decision Generated",
        target: interview.candidate.fullName,
        source: "Evaluation Engine",
        detail: decision || "Review",
      })
    }

    const roleInsight = roleMap.get(interview.job.jobId) ?? {
      jobId: interview.job.jobId,
      jobTitle: interview.job.jobTitle,
      scores: [],
      flagged: 0,
      completed: 0,
      selected: 0,
      skillGaps: new Map<string, number>(),
    }

    if (score !== null) {
      roleInsight.scores.push(score)
    }
    if (isFlagged) {
      roleInsight.flagged += 1
    }
    if (isCompleted) {
      roleInsight.completed += 1
    }
    if (isSelected) {
      roleInsight.selected += 1
    }

    Object.entries(profile?.skill_scores ?? {}).forEach(([skill, item]) => {
      const avgScore = Number(item?.average ?? 0)
      if (avgScore > 0 && avgScore < 3.2) {
        roleInsight.skillGaps.set(skill, (roleInsight.skillGaps.get(skill) ?? 0) + 1)
      }
    })

    roleMap.set(interview.job.jobId, roleInsight)
  })

  const dropOffRate = percentage(Math.max(invited - started, 0), invited)
  const confidenceScore = average(confidenceSeries)
  const clarityIndex = average(claritySeries)
  const stressIndex = average(stressSeries)
  const suspicionIndex = average(suspicionSeries)

  const executiveSummary = {
    totalCandidates: candidateIds.size,
    completedInterviews: completed,
    flaggedCandidates: flagged,
    recommendedHires,
    dropOffRate,
    cards: [
      { label: "Total Candidates", value: candidateIds.size, helper: "Unique candidates seen in this recruiter organization" },
      { label: "Completed Interviews", value: completed, helper: "Interviews that reached evaluation or end state" },
      { label: "Flagged Candidates", value: flagged, helper: "Candidates requiring elevated recruiter review" },
      { label: "Recommended Hires", value: recommendedHires, helper: "Hire recommendations from decisions and score thresholds" },
    ],
  }

  const interviewFunnel = {
    stages: [
      {
        key: "invited",
        label: "Invited",
        count: invited,
        conversionRate: 100,
        dropOffRate: percentage(Math.max(invited - started, 0), invited),
      },
      {
        key: "started",
        label: "Started",
        count: started,
        conversionRate: percentage(started, invited),
        dropOffRate: percentage(Math.max(started - completed, 0), started),
      },
      {
        key: "completed",
        label: "Completed",
        count: completed,
        conversionRate: percentage(completed, invited),
        dropOffRate: percentage(Math.max(completed - selected, 0), completed),
      },
      {
        key: "flagged",
        label: "Flagged",
        count: flagged,
        conversionRate: percentage(flagged, completed || invited),
        dropOffRate: percentage(flagged, completed || invited),
      },
      {
        key: "selected",
        label: "Selected",
        count: selected,
        conversionRate: percentage(selected, completed || invited),
        dropOffRate: 0,
      },
    ],
  }

  const fraudDetection = {
    cards: [
      {
        label: "Multiple Face Detection",
        value: 0,
        helper: "Reserved for camera-based face anomaly events once forensic telemetry is attached.",
      },
      {
        label: "Voice Mismatch",
        value: 0,
        helper: "Reserved for voiceprint mismatch events when audio forensic ingestion is enabled.",
      },
      {
        label: "Tab Switching",
        value: flagged,
        helper: "Current proxy uses flagged interview count until browser-focus telemetry is attached.",
      },
      {
        label: "Suspicious Patterns",
        value: flagged + Math.round(suspicionIndex >= 60 ? completed * 0.15 : completed * 0.05),
        helper: "Combined heuristic across flagged sessions and high suspicion trend.",
      },
    ],
    suspiciousPatterns: [
      `Suspicion index currently sits at ${suspicionIndex}.`,
      dropOffRate > 40 ? "Invite-to-start drop-off is materially elevated and should be reviewed." : "Invite-to-start conversion remains within a stable operating band.",
      flagged > 0 ? `${flagged} interview${flagged === 1 ? "" : "s"} are active in the flagged lane.` : "No active flagged interviews detected in the current snapshot.",
    ],
  }

  const candidateRanking = rankingRows
    .sort((left, right) => right.score - left.score)
    .slice(0, 10)
    .map((row, index) => ({
      ...row,
      rank: index + 1,
    }))

  const roleInsights = [...roleMap.values()]
    .map((item) => ({
      jobId: item.jobId,
      jobTitle: item.jobTitle,
      averageScore: average(item.scores),
      completedInterviews: item.completed,
      flaggedInterviews: item.flagged,
      selectedCandidates: item.selected,
      failureTrend:
        item.completed === 0
          ? "No completed interviews yet"
          : item.flagged >= Math.max(2, Math.ceil(item.completed * 0.3))
            ? "High escalation rate"
            : item.selected === 0 && item.completed >= 3
              ? "Low conversion to selection"
              : "Stable progression",
      skillGaps: [...item.skillGaps.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([skill]) => skill),
    }))
    .sort((left, right) => right.completedInterviews - left.completedInterviews)

  const sortedTimeline = timelineEvents
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, 18)

  const sortedAuditLogs = auditLogs
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, 24)

  return {
    generatedAt: new Date().toISOString(),
    executiveSummary,
    interviewFunnel,
    cognitiveRisk: {
      confidenceScore,
      stressIndex,
      clarityIndex,
      suspicionIndex,
      behavioralAnomalies: flagged + Math.round(stressIndex > 45 ? 2 : 0),
      narrative: buildNarrative({
        confidenceScore,
        suspicionIndex,
        clarityIndex,
        stressIndex,
        flaggedCandidates: flagged,
      }),
    },
    interviewTimeline: sortedTimeline,
    fraudDetection,
    candidateRanking,
    roleInsights,
    auditLogs: sortedAuditLogs,
  }
}

function getCachedReports(cacheKey: string) {
  const cached = reportsCache.get(cacheKey)
  if (!cached) {
    return null
  }

  if (cached.expiresAt <= Date.now()) {
    reportsCache.delete(cacheKey)
    return null
  }

  return cached.value
}

export async function getReportsOverview(organizationId: string) {
  const cacheKey = `reports:${organizationId}`
  const cached = getCachedReports(cacheKey)
  if (cached) {
    return cached
  }

  const payload = await loadReportsData(organizationId)
  reportsCache.set(cacheKey, {
    value: payload,
    expiresAt: Date.now() + REPORTS_CACHE_TTL_MS,
  })
  return payload
}
