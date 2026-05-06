import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { evaluateCandidateResponse } from "@/lib/server/ai/interview-flow"
import { errorResponse } from "@/lib/server/response"
import { prisma } from "@/lib/server/prisma"
import { getInterviewAppUrl } from "@/lib/server/interview-url"
import { deriveInterviewStatus } from "@/lib/server/services/interview-status"

type InterviewAnswerSummaryRow = {
  attempt_id: string
  answer_id: string
  answer_text: string | null
  answer_payload: unknown | null
  answered_at: Date | null
  question_text: string | null
  question_order: number | null
  question_type: string | null
  question_source: string | null
  skill: string | null
  ai_score: unknown | null
  ai_feedback: string | null
  skill_score: unknown | null
  clarity_score: unknown | null
  depth_score: unknown | null
  confidence_score: unknown | null
  fraud_score: unknown | null
  evaluation_json: unknown | null
  legacy_score: unknown | null
  legacy_feedback: string | null
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }

  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toPercentScore(value: number) {
  if (value >= 0 && value <= 1) {
    return value * 100
  }

  if (value > 1 && value <= 5) {
    return value * 20
  }

  return value
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function getJsonNumber(source: unknown, keys: string[]) {
  if (!source || typeof source !== "object") {
    return null
  }

  for (const key of keys) {
    const value = (source as Record<string, unknown>)[key]
    const numeric = toNumberOrNull(value)
    if (numeric !== null) {
      return numeric
    }
  }

  return null
}

function mapAnswerSummaryRow(row: InterviewAnswerSummaryRow) {
  const primaryScore = toNumberOrNull(row.ai_score)
  const legacyScore = toNumberOrNull(row.legacy_score)

  return {
    answerId: row.answer_id,
    question: row.question_text || "Question text was not recorded for this answer.",
    answerText: row.answer_text || "No response provided.",
    answerPayload: row.answer_payload ?? null,
    answeredAt: row.answered_at,
    questionOrder: row.question_order,
    questionType: row.question_type,
    questionSource: row.question_source,
    skill: row.skill,
    score: primaryScore ?? legacyScore,
    feedback: row.ai_feedback || row.legacy_feedback || null,
    skillScore: toNumberOrNull(row.skill_score),
    clarityScore: toNumberOrNull(row.clarity_score),
    depthScore: toNumberOrNull(row.depth_score),
    confidenceScore: toNumberOrNull(row.confidence_score),
    fraudScore: toNumberOrNull(row.fraud_score),
    evaluation: row.evaluation_json ?? null,
  }
}

function getAnswerMetricPercent(answer: ReturnType<typeof mapAnswerSummaryRow>, metric: "skill" | "clarity" | "depth" | "confidence" | "fraud") {
  const metricMap = {
    skill: {
      direct: answer.skillScore,
      keys: ["skill_score", "skillScore", "score"],
    },
    clarity: {
      direct: answer.clarityScore,
      keys: ["clarity_score", "clarityScore"],
    },
    depth: {
      direct: answer.depthScore,
      keys: ["depth_score", "depthScore"],
    },
    confidence: {
      direct: answer.confidenceScore,
      keys: ["confidence_score", "confidenceScore"],
    },
    fraud: {
      direct: answer.fraudScore,
      keys: ["fraud_score", "fraudScore", "suspicion_score", "suspicionScore"],
    },
  }[metric]

  const direct = metricMap.direct
  if (direct !== null && direct !== undefined) {
    return toPercentScore(Number(direct))
  }

  const jsonValue = getJsonNumber(answer.evaluation, metricMap.keys)
  if (jsonValue !== null) {
    return toPercentScore(jsonValue)
  }

  if (metric === "skill" && answer.score !== null && answer.score !== undefined) {
    return toPercentScore(Number(answer.score))
  }

  const fallback = evaluateCandidateResponse({
    skill: answer.skill || answer.question,
    answer: answer.answerText,
    fraudScore: metric === "fraud" ? 0 : undefined,
  })

  const fallbackMap = {
    skill: fallback.skill_score,
    clarity: fallback.clarity_score,
    depth: fallback.depth_score,
    confidence: fallback.confidence_score,
    fraud: fallback.suspicion_score,
  }

  return toPercentScore(fallbackMap[metric])
}

function deriveResultFromAnswerSummaries(answerSummaries: Array<ReturnType<typeof mapAnswerSummaryRow>>) {
  const substantiveAnswers = answerSummaries.filter((answer) => {
    const normalized = String(answer.answerText ?? "").trim().toLowerCase()
    return normalized && normalized !== "no response provided."
  })

  if (substantiveAnswers.length === 0) {
    return {
      score: null,
      decision: null,
    }
  }

  const scoredAnswers = substantiveAnswers.map((answer) => {
    const skill = getAnswerMetricPercent(answer, "skill")
    const clarity = getAnswerMetricPercent(answer, "clarity")
    const depth = getAnswerMetricPercent(answer, "depth")
    const confidence = getAnswerMetricPercent(answer, "confidence")
    const fraud = getAnswerMetricPercent(answer, "fraud")

    const weightedScore =
      skill * 0.4 +
      clarity * 0.2 +
      depth * 0.2 +
      confidence * 0.15 +
      Math.max(0, 100 - fraud) * 0.05

    return {
      score: weightedScore,
      fraud,
    }
  })

  const averageScore = scoredAnswers.reduce((total, item) => total + item.score, 0) / scoredAnswers.length
  const maxFraud = Math.max(...scoredAnswers.map((item) => item.fraud))
  const score = clampPercent(averageScore)

  let decision = "REJECT"
  if (maxFraud >= 70) {
    decision = "FLAGGED"
  } else if (score >= 75) {
    decision = "HIRE"
  } else if (score >= 60) {
    decision = "REVIEW"
  }

  return {
    score,
    decision,
  }
}

function buildAnswerFallbackSummary(rows: Array<ReturnType<typeof mapAnswerSummaryRow>>) {
  if (rows.length === 0) {
    return null
  }

  const scoredRows = rows
    .map((row) => row.score)
    .filter((score) => score !== null && score !== undefined)
    .map((score) => toPercentScore(Number(score)))
  const averageScore =
    scoredRows.length > 0
      ? Math.round(scoredRows.reduce((total, score) => total + Number(score), 0) / scoredRows.length)
      : null
  const answeredCount = rows.filter((row) => row.answerText && row.answerText !== "No response provided.").length
  const result = deriveResultFromAnswerSummaries(rows)

  return [
    `Transcript captured ${rows.length} question${rows.length === 1 ? "" : "s"} with ${answeredCount} substantive answer${answeredCount === 1 ? "" : "s"}.`,
    averageScore !== null ? `Average raw answer score from AI evaluation rows: ${averageScore}%.` : null,
    result.score !== null ? `Final calculated result: ${result.score}% (${result.decision}).` : null,
    "Review the transcript and per-answer AI feedback below for the detailed result.",
  ].filter(Boolean).join("\n")
}

async function fetchAnswerSummaries(attemptIds: string[]) {
  if (attemptIds.length === 0) {
    return new Map<string, ReturnType<typeof mapAnswerSummaryRow>[]>()
  }

  try {
    const rows = await prisma.$queryRawUnsafe<InterviewAnswerSummaryRow[]>(
      `
        select
          ans.attempt_id,
          ans.answer_id,
          ans.answer_text,
          ans.answer_payload,
          ans.answered_at,
          coalesce(sq.content, iq.question_text, q.question_text) as question_text,
          coalesce(sq.question_order, iq.question_order) as question_order,
          coalesce(sq.question_kind, iq.question_type, q.question_type) as question_type,
          coalesce(sq.source, iq.source_type) as question_source,
          coalesce(iq.reference_context->>'skill', iq.reference_context->>'anchor', q.skill_domain) as skill,
          iae.score as ai_score,
          iae.feedback as ai_feedback,
          iae.skill_score,
          iae.clarity_score,
          iae.depth_score,
          iae.confidence_score,
          iae.fraud_score,
          iae.evaluation_json,
          ae.raw_score as legacy_score,
          ae.rubric_reason as legacy_feedback
        from public.interview_answers ans
        left join public.session_questions sq
          on sq.session_question_id = ans.session_question_id
          or (sq.attempt_id = ans.attempt_id and sq.question_id = ans.question_id)
        left join public.interview_attempts att
          on att.attempt_id = ans.attempt_id
        left join public.interview_questions iq
          on iq.interview_id = att.interview_id
          and (
            iq.interview_question_id = ans.question_id
            or iq.question_id = ans.question_id
            or iq.interview_question_id = ans.session_question_id
            or iq.question_id = sq.question_id
          )
        left join public.questions q
          on q.question_id = coalesce(ans.question_id, sq.question_id, iq.question_id)
        left join public.interview_answer_evaluations iae
          on iae.answer_id = ans.answer_id
        left join public.answer_evaluations ae
          on ae.answer_id = ans.answer_id
        where ans.attempt_id = any($1::uuid[])
        order by ans.attempt_id, coalesce(sq.question_order, iq.question_order) asc nulls last, ans.answered_at asc nulls last
      `,
      attemptIds
    )

    return rows.reduce((map, row) => {
      const current = map.get(row.attempt_id) ?? []
      current.push(mapAnswerSummaryRow(row))
      map.set(row.attempt_id, current)
      return map
    }, new Map<string, ReturnType<typeof mapAnswerSummaryRow>[]>())
  } catch (error) {
    console.error("Failed to fetch interview answer summaries", error)
    return new Map<string, ReturnType<typeof mapAnswerSummaryRow>[]>()
  }
}

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
            usedAt: true,
            token: true,
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

    const attemptIds = interviews
      .map((interview) => interview.attempts[0]?.attemptId)
      .filter((attemptId): attemptId is string => Boolean(attemptId))
    const answerSummaryMap = await fetchAnswerSummaries(attemptIds)

    const data = interviews.map((interview) => {
      const latestInvite = interview.interviewInvites[0] ?? null
      const latestAttempt = interview.attempts[0] ?? null
      const evaluation = latestAttempt?.evaluation ?? null
      const answerSummaries = latestAttempt?.attemptId ? answerSummaryMap.get(latestAttempt.attemptId) ?? [] : []
      const calculatedResult = deriveResultFromAnswerSummaries(answerSummaries)
      const questionStatus = interview.questionStatus ?? null
      const emailStatus = interview.emailStatus ?? null
      const failureReason = interview.failureReason ?? null
      const lastError = interview.lastError ?? null
      const status = deriveInterviewStatus({
        interviewStatus: interview.status,
        questionStatus,
        emailStatus,
        latestAttempt,
        latestInvite,
      })

      return {
        interviewId: interview.interviewId,
        attemptId: latestAttempt?.attemptId ?? null,
        candidateName: interview.candidate.fullName,
        jobTitle: interview.job.jobTitle,
        status,
        interviewStatus: interview.status ?? null,
        questionStatus,
        emailStatus,
        failureReason,
        lastError,
        questionsGeneratedAt: interview.questionsGeneratedAt ?? null,
        emailSentAt: interview.emailSentAt ?? null,
        inviteStatus: latestInvite?.status ?? null,
        inviteToken: latestInvite?.token ?? null,
        link: latestInvite?.token ? `${getInterviewAppUrl().replace(/\/$/, "")}/interview/${latestInvite.token}` : null,
        attemptStatus: latestAttempt?.status ?? null,
        accessType: latestInvite?.accessType ?? "FLEXIBLE",
        startTime: latestInvite?.startTime ?? null,
        endTime: latestInvite?.endTime ?? null,
        expiresAt: latestInvite?.expiresAt ?? null,
        startedAt: latestAttempt?.startedAt ?? null,
        endedAt: latestAttempt?.endedAt ?? null,
        score: evaluation?.finalScore === null || evaluation?.finalScore === undefined ? calculatedResult.score : Number(evaluation.finalScore),
        decision: evaluation?.decision ?? calculatedResult.decision,
        aiSummary: evaluation?.aiSummary ?? buildAnswerFallbackSummary(answerSummaries),
        answerSummaries,
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
