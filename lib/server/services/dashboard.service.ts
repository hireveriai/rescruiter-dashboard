import { Prisma } from "@prisma/client"

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

type CandidateDashboardRow = {
  candidate_id: string
  candidate_name: string | null
  candidate_status: string | null
  candidate_created_at: Date
  interview_id: string | null
  interview_status: string | null
  interview_created_at: Date | null
  job_title: string | null
  invite_access_type: string | null
  invite_start_time: Date | null
  invite_end_time: Date | null
  invite_expires_at: Date | null
  invite_status: string | null
  invite_created_at: Date | null
  invite_used_at: Date | null
  attempt_id: string | null
  attempt_status: string | null
  attempt_started_at: Date | null
  attempt_ended_at: Date | null
  final_score: unknown | null
  decision: string | null
  ai_summary: string | null
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

  const rows = await prisma.$queryRaw<CandidateDashboardRow[]>(Prisma.sql`
    select
      c.candidate_id::text as candidate_id,
      c.full_name as candidate_name,
      to_jsonb(c)->>'status' as candidate_status,
      c.created_at as candidate_created_at,
      i.interview_id::text as interview_id,
      i.status as interview_status,
      i.created_at as interview_created_at,
      jp.job_title,
      inv.access_type as invite_access_type,
      inv.start_time as invite_start_time,
      inv.end_time as invite_end_time,
      inv.expires_at as invite_expires_at,
      inv.status as invite_status,
      inv.created_at as invite_created_at,
      inv.used_at as invite_used_at,
      att.attempt_id::text as attempt_id,
      att.status as attempt_status,
      att.started_at as attempt_started_at,
      att.ended_at as attempt_ended_at,
      ev.final_score,
      ev.decision,
      ev.ai_summary
    from public.candidates c
    left join lateral (
      select *
      from public.interviews i
      where i.candidate_id = c.candidate_id
        and i.organization_id = c.organization_id
      order by i.created_at desc
      limit 1
    ) i on true
    left join public.job_positions jp
      on jp.job_id = i.job_id
    left join lateral (
      select *
      from public.interview_invites inv
      where inv.interview_id = i.interview_id
      order by inv.created_at desc
      limit 1
    ) inv on true
    left join lateral (
      select *
      from public.interview_attempts att
      where att.interview_id = i.interview_id
      order by att.started_at desc
      limit 1
    ) att on true
    left join public.interview_evaluations ev
      on ev.attempt_id = att.attempt_id
    where c.organization_id = ${options.organizationId}::uuid
    order by coalesce(i.created_at, c.created_at) desc
    ${take ? Prisma.sql`limit ${take}` : Prisma.empty}
  `)

  const attemptIds = rows
    .map((row) => row.attempt_id)
    .filter((attemptId): attemptId is string => Boolean(attemptId))
  const answerSummaryMap = await fetchAnswerSummaries(attemptIds)

  return rows.map((row): CandidatesDashboardItem => {
    const hasInterview = Boolean(row.interview_id)
    const latestAttempt = row.attempt_id
      ? {
          attemptId: row.attempt_id,
          status: row.attempt_status,
          startedAt: row.attempt_started_at,
          endedAt: row.attempt_ended_at,
        }
      : null
    const latestInvite = row.invite_created_at || row.invite_status
      ? {
          status: row.invite_status,
          accessType: row.invite_access_type,
          startTime: row.invite_start_time,
          endTime: row.invite_end_time,
          expiresAt: row.invite_expires_at,
          usedAt: row.invite_used_at,
          createdAt: row.invite_created_at,
        }
      : null
    const answerSummaries = row.attempt_id ? answerSummaryMap.get(row.attempt_id) ?? [] : []
    const calculatedResult = deriveResultFromAnswerSummaries(answerSummaries)
    const finalScore = row.final_score === null || row.final_score === undefined ? calculatedResult.score : Number(row.final_score)
    const aiSummaryFull = row.ai_summary ?? buildAnswerFallbackSummary(answerSummaries)

    return {
      candidateId: row.candidate_id,
      interviewId: row.interview_id,
      attemptId: row.attempt_id,
      candidateName: row.candidate_name || "Candidate",
      jobTitle: row.job_title ?? "-",
      status: hasInterview
        ? deriveInterviewStatus({
            interviewStatus: row.interview_status,
            latestAttempt,
            latestInvite,
          })
        : row.candidate_status ?? "PENDING",
      score: Number.isFinite(finalScore) ? finalScore : calculatedResult.score,
      aiSummaryShort: getShortSummary(aiSummaryFull),
      aiSummaryFull,
      decision: row.decision ?? calculatedResult.decision,
      accessType: row.invite_access_type ?? "FLEXIBLE",
      startTime: row.invite_start_time ?? null,
      endTime: row.invite_end_time ?? null,
      expiresAt: row.invite_expires_at ?? null,
      startedAt: row.attempt_started_at ?? null,
      endedAt: row.attempt_ended_at ?? null,
      createdAt: row.interview_created_at ?? row.candidate_created_at,
      answerSummaries,
    }
  })
}
