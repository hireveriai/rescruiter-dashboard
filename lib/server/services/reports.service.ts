import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"

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
    confidenceScore: number | null
    stressIndex: number | null
    clarityIndex: number | null
    suspicionIndex: number | null
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

export type NormalizedReportRow = {
  organizationId: string
  jobId: string
  jobTitle: string
  candidateId: string
  candidateName: string
  interviewId: string
  attemptId: string | null
  inviteId: string | null
  inviteStatus: string | null
  interviewStatus: string | null
  attemptStatus: string | null
  startedAt: string | null
  endedAt: string | null
  inviteCreatedAt: string | null
  inviteExpiresAt: string | null
  latestRecordingUrl: string | null
  avg_confidence_score: number | null
  avg_clarity_score: number | null
  avg_depth_score: number | null
  avg_fraud_score: number | null
  multi_face_count: number
  tab_switch_count: number
  attention_loss_count: number
  long_gaze_away_count: number
  no_face_count: number
  focus_metrics_count: number
  avg_focus_ratio: number | null
  max_look_away_duration: number | null
  avg_look_away_events: number | null
  skills_tested_count: number
  skills_low_score_count: number
  skills_missing_count: number
  avg_skill_score: number | null
  missingSkills: string[]
  weakSkills: string[]
  normalized_score: number | null
  overall_score: number | null
  hire_recommendation: string | null
  result_status: string | null
  risk_level: string | null
  suspicious_index: number
  is_flagged: boolean
}

type SkillProfileRow = {
  attempt_id: string
  skill_scores: Record<string, { average?: number; bucket?: string; samples?: number }>
  strengths?: string[]
  weaknesses?: string[]
  overall_weighted_score: number | null
}

type SkillStateRow = {
  attempt_id: string
  interview_id: string | null
  skills_covered: string[] | null
  skills_remaining: string[] | null
  response_metrics: unknown | null
  answers: unknown | null
  role_confidence: number | null
  adaptive_mode: boolean | null
  updated_at: string | null
}

type SummaryRow = {
  attempt_id: string
  overall_score: number | null
  risk_level: string | null
  hire_recommendation: string | null
  confidence_score: number | null
  strengths: string[] | string | null
  weaknesses: string[] | string | null
  created_at: string | null
}

type RecordingRow = {
  attempt_id: string | null
  interview_id: string | null
  recording_url: string | null
  created_at: string | null
}

type SignalAggRow = {
  attempt_id: string | null
  interview_id: string | null
  multi_face_count: number
  tab_switch_count: number
  attention_loss_count: number
  long_gaze_away_count: number
  no_face_count: number
  focus_metrics_count: number
  avg_focus_ratio: number | null
  max_look_away_duration: number | null
  avg_look_away_events: number | null
}

const REPORTS_CACHE_TTL_MS = 30_000
const reportsCache = new Map<string, CacheEntry>()

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase()
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
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

function averageNullable(values: number[]) {
  if (!values.length) {
    return null
  }

  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3))
}

function buildNarrative(params: {
  confidenceScore: number | null
  suspicionIndex: number | null
  clarityIndex: number | null
  behavioralAnomalies: number
  flaggedCandidates: number
}) {
  const confidenceScore = params.confidenceScore ?? 0
  const suspicionIndex = params.suspicionIndex ?? 0
  const clarityIndex = params.clarityIndex ?? 0

  const confidenceLabel =
    confidenceScore >= 0.75 ? "high-confidence responses" : confidenceScore >= 0.55 ? "mixed confidence" : "fragile confidence"
  const suspicionLabel =
    suspicionIndex >= 60 ? "elevated forensic scrutiny" : suspicionIndex >= 35 ? "moderate scrutiny" : "low observed suspicion"

  return `Current interviews show ${confidenceLabel}, ${suspicionLabel}, and a clarity index of ${Math.round(clarityIndex * 100)}/100. ${params.behavioralAnomalies} anomaly signal${params.behavioralAnomalies === 1 ? "" : "s"} and ${params.flaggedCandidates} flagged candidate${params.flaggedCandidates === 1 ? "" : "s"} are currently visible from calm-room telemetry.`
}

function parseJson<T>(value: unknown): T | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === "object") {
    return value as T
  }

  if (typeof value !== "string") {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return [] as string[]
}

function normalizeRecommendation(value: string | null | undefined) {
  const normalized = normalizeStatus(value)
  if (!normalized) {
    return null
  }

  if (["PROCEED", "HIRE", "SELECTED"].includes(normalized)) {
    return "HIRE"
  }

  if (["HOLD", "REVIEW", "MAYBE"].includes(normalized)) {
    return "HOLD"
  }

  if (["REJECT", "DECLINE", "NO_HIRE"].includes(normalized)) {
    return "REJECT"
  }

  return normalized
}

function normalizeRiskLevel(value: string | null | undefined) {
  const normalized = normalizeStatus(value)
  if (!normalized) {
    return null
  }

  if (["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(normalized)) {
    return normalized
  }

  return null
}

function toPercentUnit(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null
  }

  if (value > 1) {
    return Number(Math.min(100, Math.max(0, value)).toFixed(2))
  }

  return Number((Math.min(1, Math.max(0, value)) * 100).toFixed(2))
}

async function tableExists(tableName: string) {
  const rows = await prisma.$queryRaw<Array<{ regclass: string | null }>>`
    select to_regclass(${`public.${tableName}`})::text as regclass
  `

  return Boolean(rows[0]?.regclass)
}

async function getTableColumns(tableName: string) {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${tableName}
  `

  return new Set(rows.map((row) => row.column_name))
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, "\"\"")}"`
}

function buildAggregateExpr(columns: Set<string>, columnName: string, aggregateSql: string, fallbackSql: string) {
  return columns.has(columnName) ? `${aggregateSql} as ${quoteIdentifier(columnName)}` : `${fallbackSql} as ${quoteIdentifier(columnName)}`
}

function extractAnalyses(answers: unknown) {
  const parsed = parseJson<Array<{ analysis?: Record<string, unknown> }>>(answers)
  if (!parsed) {
    return [] as Array<Record<string, unknown>>
  }

  return parsed
    .map((item) => (item && typeof item === "object" ? item.analysis : null))
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
}

function extractResponseMetricValue(metrics: unknown, key: string) {
  const parsed = parseJson<Record<string, unknown>>(metrics)
  const numeric = toNumber(parsed?.[key] as number | string | null | undefined)
  return numeric
}

function buildResponseMetricAverages(row: SkillStateRow | undefined) {
  if (!row) {
    return {
      avg_confidence_score: null,
      avg_clarity_score: null,
      avg_depth_score: null,
      avg_fraud_score: null,
    }
  }

  const analyses = extractAnalyses(row.answers)
  const confidenceValues = analyses.map((item) => toNumber(item.confidence_score as number | null | undefined)).filter((item): item is number => item !== null)
  const clarityValues = analyses.map((item) => toNumber(item.clarity_score as number | null | undefined)).filter((item): item is number => item !== null)
  const depthValues = analyses.map((item) => toNumber(item.depth_score as number | null | undefined)).filter((item): item is number => item !== null)
  const suspicionValues = analyses.map((item) => toNumber(item.suspicion_score as number | null | undefined)).filter((item): item is number => item !== null)

  return {
    avg_confidence_score: averageNullable(confidenceValues) ?? extractResponseMetricValue(row.response_metrics, "confidence_score"),
    avg_clarity_score: averageNullable(clarityValues) ?? extractResponseMetricValue(row.response_metrics, "clarity_score"),
    avg_depth_score: averageNullable(depthValues) ?? extractResponseMetricValue(row.response_metrics, "depth_score"),
    avg_fraud_score: averageNullable(suspicionValues) ?? extractResponseMetricValue(row.response_metrics, "suspicion_score"),
  }
}

async function fetchSkillProfiles(attemptIds: string[]) {
  if (attemptIds.length === 0 || !(await tableExists("interview_skill_profiles"))) {
    return new Map<string, SkillProfileRow>()
  }

  const rows = await prisma.$queryRaw<SkillProfileRow[]>(Prisma.sql`
    select
      attempt_id::text as attempt_id,
      skill_scores,
      strengths,
      weaknesses,
      overall_weighted_score
    from public.interview_skill_profiles
    where attempt_id in (${Prisma.join(attemptIds.map((id) => Prisma.sql`${id}::uuid`))})
  `).catch(() => [] as SkillProfileRow[])

  return new Map(rows.map((row) => [row.attempt_id, row]))
}

async function fetchSkillStates(attemptIds: string[]) {
  if (attemptIds.length === 0 || !(await tableExists("interview_skill_state"))) {
    return new Map<string, SkillStateRow>()
  }

  const rows = await prisma.$queryRaw<SkillStateRow[]>(Prisma.sql`
    select
      attempt_id::text as attempt_id,
      interview_id::text as interview_id,
      skills_covered,
      skills_remaining,
      response_metrics,
      answers,
      role_confidence,
      adaptive_mode,
      updated_at::text as updated_at
    from public.interview_skill_state
    where attempt_id in (${Prisma.join(attemptIds.map((id) => Prisma.sql`${id}::uuid`))})
  `).catch(() => [] as SkillStateRow[])

  return new Map(rows.map((row) => [row.attempt_id, row]))
}

async function fetchInterviewSummaries(organizationId: string) {
  if (!(await tableExists("interview_summaries"))) {
    return new Map<string, SummaryRow>()
  }

  const columns = await getTableColumns("interview_summaries")
  const selectParts = [
    columns.has("attempt_id") ? `attempt_id::text as attempt_id` : `null::text as attempt_id`,
    columns.has("overall_score") ? `overall_score` : `null::numeric as overall_score`,
    columns.has("risk_level") ? `risk_level` : `null::text as risk_level`,
    columns.has("hire_recommendation") ? `hire_recommendation` : columns.has("recommendation") ? `recommendation as hire_recommendation` : `null::text as hire_recommendation`,
    columns.has("confidence_score") ? `confidence_score` : `null::numeric as confidence_score`,
    columns.has("strengths") ? `strengths` : `null::text as strengths`,
    columns.has("weaknesses") ? `weaknesses` : `null::text as weaknesses`,
    columns.has("created_at") ? `created_at::text as created_at` : `null::text as created_at`,
  ]

  const query = `
    select ${selectParts.join(", ")}
    from public.interview_summaries s
    inner join public.interview_attempts ia on ia.attempt_id = s.attempt_id
    inner join public.interviews i on i.interview_id = ia.interview_id
    where i.organization_id = $1::uuid
  `

  const rows = await prisma.$queryRawUnsafe<SummaryRow[]>(query, organizationId).catch(() => [] as SummaryRow[])
  return new Map(rows.filter((row) => row.attempt_id).map((row) => [row.attempt_id, row]))
}

async function fetchRecordingRows(organizationId: string) {
  if (!(await tableExists("interview_recordings"))) {
    return [] as RecordingRow[]
  }

  const columns = await getTableColumns("interview_recordings")
  const urlColumn = columns.has("audio_url") ? "audio_url" : columns.has("recording_url") ? "recording_url" : null
  if (!urlColumn) {
    return [] as RecordingRow[]
  }

  const query = `
    select
      ${columns.has("attempt_id") ? "ir.attempt_id::text" : "null::text"} as attempt_id,
      ${columns.has("interview_id") ? "ir.interview_id::text" : "ia.interview_id::text"} as interview_id,
      ir.${quoteIdentifier(urlColumn)}::text as recording_url,
      ${columns.has("created_at") ? "ir.created_at::text" : "now()::text"} as created_at
    from public.interview_recordings ir
    left join public.interview_attempts ia on ${columns.has("attempt_id") ? "ia.attempt_id = ir.attempt_id" : "false"}
    left join public.interviews i on i.interview_id = ${columns.has("interview_id") ? "ir.interview_id" : "ia.interview_id"}
    where i.organization_id = $1::uuid
  `

  return prisma.$queryRawUnsafe<RecordingRow[]>(query, organizationId).catch(() => [] as RecordingRow[])
}

async function fetchSignalRows(organizationId: string) {
  if (!(await tableExists("interview_signals"))) {
    return [] as SignalAggRow[]
  }

  const columns = await getTableColumns("interview_signals")
  const selectParts = [
    columns.has("attempt_id") ? `attempt_id::text as attempt_id` : `null::text as attempt_id`,
    columns.has("interview_id") ? `interview_id::text as interview_id` : `null::text as interview_id`,
    buildAggregateExpr(columns, "multi_face_count", "sum(coalesce(multi_face_count, 0))::int", "0::int"),
    buildAggregateExpr(columns, "tab_switch_count", "sum(coalesce(tab_switch_count, 0))::int", "0::int"),
    buildAggregateExpr(columns, "attention_loss_count", "sum(coalesce(attention_loss_count, 0))::int", "0::int"),
    buildAggregateExpr(columns, "long_gaze_away_count", "sum(coalesce(long_gaze_away_count, 0))::int", "0::int"),
    buildAggregateExpr(columns, "no_face_count", "sum(coalesce(no_face_count, 0))::int", "0::int"),
    buildAggregateExpr(columns, "focus_metrics_count", "sum(coalesce(focus_metrics_count, 0))::int", "0::int"),
    columns.has("focus_ratio") ? `avg(coalesce(focus_ratio, 0))::numeric as avg_focus_ratio` : columns.has("avg_focus_ratio") ? `avg(coalesce(avg_focus_ratio, 0))::numeric as avg_focus_ratio` : `null::numeric as avg_focus_ratio`,
    columns.has("look_away_duration") ? `max(coalesce(look_away_duration, 0))::numeric as max_look_away_duration` : columns.has("max_look_away_duration") ? `max(coalesce(max_look_away_duration, 0))::numeric as max_look_away_duration` : `null::numeric as max_look_away_duration`,
    columns.has("look_away_events") ? `avg(coalesce(look_away_events, 0))::numeric as avg_look_away_events` : columns.has("avg_look_away_events") ? `avg(coalesce(avg_look_away_events, 0))::numeric as avg_look_away_events` : `null::numeric as avg_look_away_events`,
  ]

  const whereClause = columns.has("organization_id") ? `where organization_id = $1::uuid` : ``
  const query = `
    select
      ${selectParts.join(",\n      ")}
    from public.interview_signals
    ${whereClause}
    group by 1, 2
  `

  return columns.has("organization_id")
    ? prisma.$queryRawUnsafe<SignalAggRow[]>(query, organizationId).catch(() => [] as SignalAggRow[])
    : prisma.$queryRawUnsafe<SignalAggRow[]>(query).catch(() => [] as SignalAggRow[])
}

function buildRecordingMap(rows: RecordingRow[]) {
  const byAttempt = new Map<string, RecordingRow>()
  const byInterview = new Map<string, RecordingRow>()

  rows
    .sort((left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime())
    .forEach((row) => {
      if (row.attempt_id && !byAttempt.has(row.attempt_id)) {
        byAttempt.set(row.attempt_id, row)
      }
      if (row.interview_id && !byInterview.has(row.interview_id)) {
        byInterview.set(row.interview_id, row)
      }
    })

  return { byAttempt, byInterview }
}

function buildSignalMap(rows: SignalAggRow[]) {
  const byAttempt = new Map<string, SignalAggRow>()
  const byInterview = new Map<string, SignalAggRow>()

  rows.forEach((row) => {
    if (row.attempt_id) {
      byAttempt.set(row.attempt_id, row)
    }
    if (row.interview_id) {
      byInterview.set(row.interview_id, row)
    }
  })

  return { byAttempt, byInterview }
}

function deriveResultStatus(params: {
  inviteStatus: string | null
  interviewStatus: string | null
  attemptStatus: string | null
  startedAt: string | null
  endedAt: string | null
}) {
  const attemptStatus = normalizeStatus(params.attemptStatus)
  const interviewStatus = normalizeStatus(params.interviewStatus)
  const inviteStatus = normalizeStatus(params.inviteStatus)

  if (attemptStatus === "COMPLETED" || interviewStatus === "COMPLETED" || params.endedAt) {
    return "COMPLETED"
  }

  if (attemptStatus || params.startedAt) {
    return "STARTED"
  }

  if (inviteStatus) {
    return "INVITED"
  }

  return interviewStatus || null
}

function deriveSuspiciousIndex(params: {
  avgFraudScore: number | null
  multiFaceCount: number
  tabSwitchCount: number
  attentionLossCount: number
  longGazeAwayCount: number
  noFaceCount: number
  avgFocusRatio: number | null
}) {
  let score = 0
  score += (params.avgFraudScore ?? 0) * 45
  score += Math.min(params.multiFaceCount, 3) * 18
  score += Math.min(params.tabSwitchCount, 6) * 5
  score += Math.min(params.attentionLossCount, 6) * 4
  score += Math.min(params.longGazeAwayCount, 6) * 4
  score += Math.min(params.noFaceCount, 6) * 5

  if (params.avgFocusRatio !== null && params.avgFocusRatio < 0.6) {
    score += (0.6 - params.avgFocusRatio) * 40
  }

  return Number(Math.min(100, Math.max(0, score)).toFixed(1))
}

function deriveIsFlagged(row: Pick<
  NormalizedReportRow,
  | "avg_fraud_score"
  | "multi_face_count"
  | "tab_switch_count"
  | "avg_focus_ratio"
  | "attention_loss_count"
  | "long_gaze_away_count"
  | "no_face_count"
>) {
  return (
    (row.avg_fraud_score ?? 0) >= 0.6 ||
    row.multi_face_count > 0 ||
    row.tab_switch_count >= 2 ||
    (row.avg_focus_ratio !== null && row.avg_focus_ratio < 0.6) ||
    row.attention_loss_count >= 3 ||
    row.long_gaze_away_count >= 3 ||
    row.no_face_count >= 2
  )
}

export async function getNormalizedReportRows(organizationId: string): Promise<NormalizedReportRow[]> {
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
        },
      },
      job: {
        select: {
          jobId: true,
          jobTitle: true,
          coreSkills: true,
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
          status: true,
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
            },
          },
        },
      },
    },
  })

  const attemptIds = interviews.flatMap((interview) => interview.attempts.map((attempt) => attempt.attemptId))

  const [skillProfiles, skillStates, summaries, signalRows, recordingRows] = await Promise.all([
    fetchSkillProfiles(attemptIds),
    fetchSkillStates(attemptIds),
    fetchInterviewSummaries(organizationId),
    fetchSignalRows(organizationId),
    fetchRecordingRows(organizationId),
  ])

  const signalMap = buildSignalMap(signalRows)
  const recordingMap = buildRecordingMap(recordingRows)

  const rows: NormalizedReportRow[] = []

  interviews.forEach((interview) => {
    const latestInvite = interview.interviewInvites[0] ?? null
    const attempts = interview.attempts.length > 0 ? interview.attempts : [null]

    attempts.forEach((attempt) => {
      const attemptId = attempt?.attemptId ?? null
      const skillProfile = attemptId ? skillProfiles.get(attemptId) : undefined
      const skillState = attemptId ? skillStates.get(attemptId) : undefined
      const summary = attemptId ? summaries.get(attemptId) : undefined
      const signal = (attemptId ? signalMap.byAttempt.get(attemptId) : undefined) ?? signalMap.byInterview.get(interview.interviewId)
      const recording = (attemptId ? recordingMap.byAttempt.get(attemptId) : undefined) ?? recordingMap.byInterview.get(interview.interviewId)
      const responseAverages = buildResponseMetricAverages(skillState)

      const requiredSkills = normalizeStringArray(interview.job.coreSkills)
      const skillScores = skillProfile?.skill_scores ?? {}
      const weakSkills =
        normalizeStringArray(skillProfile?.weaknesses).length > 0
          ? normalizeStringArray(skillProfile?.weaknesses)
          : Object.entries(skillScores)
              .filter(([, item]) => toNumber(item?.average) !== null && Number(item.average) < 3.2)
              .map(([skill]) => skill)

      const missingSkills =
        normalizeStringArray(skillState?.skills_remaining).length > 0
          ? normalizeStringArray(skillState?.skills_remaining)
          : requiredSkills.filter((skill) => !(skill in skillScores))

      const avgSkillScore = toNumber(skillProfile?.overall_weighted_score)
      const evaluationScore = toNumber(attempt?.evaluation?.finalScore)
      const summaryOverallScore = toNumber(summary?.overall_score)
      const overallScore = summaryOverallScore ?? evaluationScore ?? (avgSkillScore !== null ? Number((avgSkillScore * 20).toFixed(1)) : null)
      const normalizedScore = overallScore ?? (avgSkillScore !== null ? Number((avgSkillScore * 20).toFixed(1)) : null)
      const hireRecommendation = normalizeRecommendation(summary?.hire_recommendation ?? attempt?.evaluation?.decision)
      const avgFocusRatio = toNumber(signal?.avg_focus_ratio)
      const suspiciousIndex = deriveSuspiciousIndex({
        avgFraudScore: responseAverages.avg_fraud_score,
        multiFaceCount: signal?.multi_face_count ?? 0,
        tabSwitchCount: signal?.tab_switch_count ?? 0,
        attentionLossCount: signal?.attention_loss_count ?? 0,
        longGazeAwayCount: signal?.long_gaze_away_count ?? 0,
        noFaceCount: signal?.no_face_count ?? 0,
        avgFocusRatio,
      })

      const row: NormalizedReportRow = {
        organizationId,
        jobId: interview.job.jobId,
        jobTitle: interview.job.jobTitle,
        candidateId: interview.candidate.candidateId,
        candidateName: interview.candidate.fullName,
        interviewId: interview.interviewId,
        attemptId,
        inviteId: latestInvite?.inviteId ?? null,
        inviteStatus: latestInvite?.status ?? null,
        interviewStatus: interview.status ?? null,
        attemptStatus: attempt?.status ?? null,
        startedAt: attempt?.startedAt?.toISOString() ?? null,
        endedAt: attempt?.endedAt?.toISOString() ?? null,
        inviteCreatedAt: latestInvite?.createdAt?.toISOString() ?? null,
        inviteExpiresAt: latestInvite?.expiresAt?.toISOString() ?? null,
        latestRecordingUrl: recording?.recording_url ?? null,
        avg_confidence_score: responseAverages.avg_confidence_score,
        avg_clarity_score: responseAverages.avg_clarity_score,
        avg_depth_score: responseAverages.avg_depth_score,
        avg_fraud_score: responseAverages.avg_fraud_score,
        multi_face_count: signal?.multi_face_count ?? 0,
        tab_switch_count: signal?.tab_switch_count ?? 0,
        attention_loss_count: signal?.attention_loss_count ?? 0,
        long_gaze_away_count: signal?.long_gaze_away_count ?? 0,
        no_face_count: signal?.no_face_count ?? 0,
        focus_metrics_count: signal?.focus_metrics_count ?? 0,
        avg_focus_ratio: avgFocusRatio,
        max_look_away_duration: toNumber(signal?.max_look_away_duration),
        avg_look_away_events: toNumber(signal?.avg_look_away_events),
        skills_tested_count: Object.keys(skillScores).length || normalizeStringArray(skillState?.skills_covered).length,
        skills_low_score_count: weakSkills.length,
        skills_missing_count: missingSkills.length,
        avg_skill_score: avgSkillScore,
        missingSkills,
        weakSkills,
        normalized_score: normalizedScore,
        overall_score: overallScore,
        hire_recommendation: hireRecommendation,
        result_status: deriveResultStatus({
          inviteStatus: latestInvite?.status ?? null,
          interviewStatus: interview.status ?? null,
          attemptStatus: attempt?.status ?? null,
          startedAt: attempt?.startedAt?.toISOString() ?? null,
          endedAt: attempt?.endedAt?.toISOString() ?? null,
        }),
        risk_level: normalizeRiskLevel(summary?.risk_level),
        suspicious_index: suspiciousIndex,
        is_flagged: false,
      }

      row.is_flagged = deriveIsFlagged(row)
      if (!row.risk_level) {
        row.risk_level = row.is_flagged ? "HIGH" : suspiciousIndex >= 40 ? "MEDIUM" : "LOW"
      }

      rows.push(row)
    })
  })

  return rows
}

async function loadReportsData(organizationId: string): Promise<ReportsPayload> {
  const rows = await getNormalizedReportRows(organizationId)

  const uniqueCandidateIds = new Set(rows.map((row) => row.candidateId))
  const invitedRows = rows.filter((row) => row.inviteId)
  const startedRows = rows.filter((row) => row.attemptId && row.startedAt)
  const completedRows = rows.filter((row) => row.result_status === "COMPLETED")
  const flaggedRows = rows.filter((row) => row.is_flagged)
  const selectedRows = rows.filter((row) => normalizeRecommendation(row.hire_recommendation) === "HIRE")
  const recommendedRows = rows.filter((row) => normalizeRecommendation(row.hire_recommendation) === "HIRE" || (row.normalized_score ?? 0) >= 80)

  const confidenceValues = rows.map((row) => row.avg_confidence_score).filter((value): value is number => value !== null)
  const clarityValues = rows.map((row) => row.avg_clarity_score).filter((value): value is number => value !== null)
  const depthValues = rows.map((row) => row.avg_depth_score).filter((value): value is number => value !== null)
  const fraudValues = rows.map((row) => row.avg_fraud_score).filter((value): value is number => value !== null)

  const confidenceScore = averageNullable(confidenceValues)
  const clarityIndex = averageNullable(clarityValues)
  const suspicionIndex = rows.length ? Number((rows.reduce((sum, row) => sum + row.suspicious_index, 0) / rows.length).toFixed(1)) : null
  const behavioralAnomalies = rows.reduce(
    (sum, row) =>
      sum +
      row.multi_face_count +
      row.tab_switch_count +
      row.attention_loss_count +
      row.long_gaze_away_count +
      row.no_face_count,
    0
  )

  const executiveSummary = {
    totalCandidates: uniqueCandidateIds.size,
    completedInterviews: completedRows.length,
    flaggedCandidates: new Set(flaggedRows.map((row) => row.candidateId)).size,
    recommendedHires: recommendedRows.length,
    dropOffRate: percentage(Math.max(invitedRows.length - startedRows.length, 0), invitedRows.length),
    cards: [
      { label: "Total Candidates", value: uniqueCandidateIds.size, helper: "Unique candidates represented in interview reporting." },
      { label: "Completed Interviews", value: completedRows.length, helper: "Attempts that reached a completed outcome state." },
      { label: "Flagged Candidates", value: new Set(flaggedRows.map((row) => row.candidateId)).size, helper: "Candidates flagged from actual calm-room evidence." },
      { label: "Recommended Hires", value: recommendedRows.length, helper: "Hire recommendations coming from score/result sources, not placeholders." },
    ],
  }

  const interviewFunnel = {
    stages: [
      {
        key: "invited",
        label: "Invited",
        count: invitedRows.length,
        conversionRate: 100,
        dropOffRate: percentage(Math.max(invitedRows.length - startedRows.length, 0), invitedRows.length),
      },
      {
        key: "started",
        label: "Started",
        count: startedRows.length,
        conversionRate: percentage(startedRows.length, invitedRows.length),
        dropOffRate: percentage(Math.max(startedRows.length - completedRows.length, 0), startedRows.length),
      },
      {
        key: "completed",
        label: "Completed",
        count: completedRows.length,
        conversionRate: percentage(completedRows.length, invitedRows.length),
        dropOffRate: percentage(Math.max(completedRows.length - selectedRows.length, 0), completedRows.length),
      },
      {
        key: "flagged",
        label: "Flagged",
        count: flaggedRows.length,
        conversionRate: percentage(flaggedRows.length, completedRows.length || invitedRows.length),
        dropOffRate: percentage(flaggedRows.length, completedRows.length || invitedRows.length),
      },
      {
        key: "selected",
        label: "Selected",
        count: selectedRows.length,
        conversionRate: percentage(selectedRows.length, completedRows.length || invitedRows.length),
        dropOffRate: 0,
      },
    ],
  }

  const fraudDetection = {
    cards: [
      {
        label: "Multiple Face Detection",
        value: rows.reduce((sum, row) => sum + row.multi_face_count, 0),
        helper: "Actual calm-room multi-face events from interview signal telemetry.",
      },
      {
        label: "Voice Mismatch",
        value: 0,
        helper: "Coming soon. Voice forensic scoring is not yet wired into recruiter reporting.",
      },
      {
        label: "Tab Switching",
        value: rows.reduce((sum, row) => sum + row.tab_switch_count, 0),
        helper: "Real browser/tab-switch counts from interview signal telemetry.",
      },
      {
        label: "Suspicious Patterns",
        value: rows.filter((row) => row.suspicious_index >= 60).length,
        helper: "Attempts whose suspicious index crosses the recruiter review threshold.",
      },
    ],
    suspiciousPatterns: rows
      .filter((row) => row.is_flagged)
      .slice(0, 6)
      .map(
        (row) =>
          `${row.candidateName} (${row.jobTitle}) flagged with suspicious index ${row.suspicious_index}. Evidence: fraud ${toPercentUnit(row.avg_fraud_score) ?? 0}%, multi-face ${row.multi_face_count}, tab switches ${row.tab_switch_count}, focus ratio ${toPercentUnit(row.avg_focus_ratio) ?? "n/a"}%.`
      ),
  }

  const candidateRanking = rows
    .filter((row) => row.attemptId && row.normalized_score !== null)
    .sort((left, right) => (right.normalized_score ?? 0) - (left.normalized_score ?? 0))
    .slice(0, 10)
    .map((row, index) => ({
      rank: index + 1,
      candidateName: row.candidateName,
      jobTitle: row.jobTitle,
      score: Number((row.normalized_score ?? 0).toFixed(1)),
      recommendation: normalizeRecommendation(row.hire_recommendation) ?? (row.normalized_score ?? 0) >= 80 ? "HIRE" : "HOLD",
      riskLevel: row.risk_level ?? "LOW",
      attemptId: row.attemptId ?? row.interviewId,
    }))

  const roleMap = new Map<
    string,
    {
      jobId: string
      jobTitle: string
      scores: number[]
      flagged: number
      completed: number
      selected: number
      weakSkills: Map<string, number>
    }
  >()

  rows.forEach((row) => {
    const current = roleMap.get(row.jobId) ?? {
      jobId: row.jobId,
      jobTitle: row.jobTitle,
      scores: [],
      flagged: 0,
      completed: 0,
      selected: 0,
      weakSkills: new Map<string, number>(),
    }

    if (row.normalized_score !== null) {
      current.scores.push(row.normalized_score)
    }
    if (row.is_flagged) {
      current.flagged += 1
    }
    if (row.result_status === "COMPLETED") {
      current.completed += 1
    }
    if (normalizeRecommendation(row.hire_recommendation) === "HIRE") {
      current.selected += 1
    }
    row.weakSkills.forEach((skill) => {
      current.weakSkills.set(skill, (current.weakSkills.get(skill) ?? 0) + 1)
    })

    roleMap.set(row.jobId, current)
  })

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
            ? "High calm-room risk signal density"
            : item.selected === 0 && item.completed >= 3
              ? "Low conversion to hire recommendation"
              : "Stable progression",
      skillGaps: [...item.weakSkills.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 3)
        .map(([skill]) => skill),
    }))
    .sort((left, right) => right.completedInterviews - left.completedInterviews)

  const interviewTimeline: TimelineEvent[] = rows
    .flatMap((row) => {
      const events: TimelineEvent[] = []

      if (row.inviteCreatedAt) {
        events.push({
          id: `invite-${row.inviteId ?? row.interviewId}`,
          at: row.inviteCreatedAt,
          title: "Interview invite issued",
          detail: `${row.candidateName} received access for ${row.jobTitle}.`,
          severity: "info",
          recordingUrl: null,
        })
      }

      if (row.startedAt) {
        events.push({
          id: `started-${row.attemptId ?? row.interviewId}`,
          at: row.startedAt,
          title: "Interview started",
          detail: `${row.candidateName} started the calm-room interview for ${row.jobTitle}.`,
          severity: "info",
          recordingUrl: row.latestRecordingUrl,
        })
      }

      if (row.is_flagged) {
        events.push({
          id: `flagged-${row.attemptId ?? row.interviewId}`,
          at: row.endedAt ?? row.startedAt ?? row.inviteCreatedAt ?? new Date().toISOString(),
          title: "Attempt flagged by telemetry",
          detail: `Suspicious index ${row.suspicious_index}; multi-face ${row.multi_face_count}, tab switches ${row.tab_switch_count}, attention loss ${row.attention_loss_count}.`,
          severity: "critical",
          recordingUrl: row.latestRecordingUrl,
        })
      }

      if (row.result_status === "COMPLETED") {
        events.push({
          id: `completed-${row.attemptId ?? row.interviewId}`,
          at: row.endedAt ?? row.startedAt ?? row.inviteCreatedAt ?? new Date().toISOString(),
          title: "Evaluation finalized",
          detail: `${row.candidateName} finished with ${row.hire_recommendation ?? "REVIEW"} and score ${row.normalized_score ?? "-"}.`,
          severity: row.is_flagged ? "warning" : "info",
          recordingUrl: row.latestRecordingUrl,
        })
      }

      return events
    })
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, 18)

  const auditLogs: AuditLogRow[] = rows
    .flatMap((row) => {
      const logs: AuditLogRow[] = []

      if (row.inviteCreatedAt) {
        logs.push({
          id: `audit-invite-${row.inviteId ?? row.interviewId}`,
          at: row.inviteCreatedAt,
          actor: "Recruiter",
          action: "Invite Created",
          target: row.candidateName,
          source: "Interview Access",
          detail: `${row.jobTitle} · ${row.inviteStatus ?? "ACTIVE"}`,
        })
      }

      if (row.startedAt) {
        logs.push({
          id: `audit-start-${row.attemptId ?? row.interviewId}`,
          at: row.startedAt,
          actor: row.candidateName,
          action: "Interview Started",
          target: row.jobTitle,
          source: "Calm Room",
          detail: `Attempt ${row.attemptId ?? row.interviewId}`,
        })
      }

      if (row.result_status === "COMPLETED") {
        logs.push({
          id: `audit-complete-${row.attemptId ?? row.interviewId}`,
          at: row.endedAt ?? row.startedAt ?? row.inviteCreatedAt ?? new Date().toISOString(),
          actor: "AI Evaluator",
          action: "Outcome Generated",
          target: row.candidateName,
          source: "Scoring Engine",
          detail: `${row.hire_recommendation ?? "REVIEW"} · ${row.risk_level ?? "LOW"}`,
        })
      }

      return logs
    })
    .sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())
    .slice(0, 24)

  return {
    generatedAt: new Date().toISOString(),
    executiveSummary,
    interviewFunnel,
    cognitiveRisk: {
      confidenceScore,
      stressIndex: null,
      clarityIndex,
      suspicionIndex,
      behavioralAnomalies,
      narrative: buildNarrative({
        confidenceScore,
        suspicionIndex,
        clarityIndex,
        behavioralAnomalies,
        flaggedCandidates: executiveSummary.flaggedCandidates,
      }),
    },
    interviewTimeline,
    fraudDetection,
    candidateRanking,
    roleInsights,
    auditLogs,
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
