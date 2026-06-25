import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { prisma } from "@/lib/server/prisma"
import { errorResponse } from "@/lib/server/response"

type RecordingRow = {
  recording_id: string
  attempt_id: string | null
  candidate_name: string | null
  job_title: string | null
  status: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string | null
  transcript: string | null
}

type TimelineRow = {
  session_question_id: string
  question_order: number | null
  question_text: string | null
  question_source: string | null
  asked_at: string | null
  answer_id: string | null
  answer_text: string | null
  answered_at: string | null
  skill_score: unknown | null
  clarity_score: unknown | null
  depth_score: unknown | null
  confidence_score: unknown | null
  fraud_score: unknown | null
  feedback: string | null
}

type SignalRow = {
  signal_id: string
  type: string
  value: unknown | null
  created_at: string | null
}

function toNumber(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toPercent(value: unknown) {
  const numeric = toNumber(value)
  if (numeric === null) {
    return null
  }

  return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric)
}

function getTime(value: string | null) {
  return value ? new Date(value).getTime() : null
}

function offsetMs(startedAt: string | null, value: string | null) {
  const start = getTime(startedAt)
  const current = getTime(value)

  if (start === null || current === null) {
    return null
  }

  return Math.max(0, current - start)
}

function readSignalOffset(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null
  }

  const offset = (value as { recordingOffsetMs?: unknown }).recordingOffsetMs
  return typeof offset === "number" && Number.isFinite(offset) ? Math.max(0, Math.round(offset)) : null
}

function getSignalSeverity(type: string, value: unknown): "low" | "medium" | "high" {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const severity = (value as { severity?: unknown }).severity
    if (severity === "low" || severity === "medium" || severity === "high") {
      return severity
    }
  }

  if (/\b(multi_face|tab_switch|no_face)\b/i.test(type)) {
    return "high"
  }

  if (/\b(long_gaze_away|attention_loss)\b/i.test(type)) {
    return "medium"
  }

  return "low"
}

function getSignalLabel(type: string) {
  return type
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

export async function GET(request: Request, context: { params: Promise<{ recordingId: string }> }) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const { recordingId } = await context.params

    const recordings = await prisma.$queryRaw<RecordingRow[]>`
      select
        ir.recording_id::text,
        ir.attempt_id::text,
        coalesce(c.full_name, 'Unknown Candidate') as candidate_name,
        coalesce(jp.job_title, '-') as job_title,
        ir.status,
        ir.started_at::text,
        ir.ended_at::text,
        ir.created_at::text,
        ir.transcript
      from public.interview_recordings ir
      left join public.interview_attempts ia
        on ia.attempt_id = ir.attempt_id
      left join public.interviews i
        on i.interview_id = ia.interview_id
      left join public.candidates c
        on c.candidate_id = i.candidate_id
      left join public.job_positions jp
        on jp.job_id = i.job_id
      where ir.recording_id::text = ${recordingId}
        and i.organization_id = ${auth.organizationId}::uuid
      limit 1
    `

    const recording = recordings[0]
    if (!recording?.attempt_id) {
      throw new ApiError(404, "RECORDING_NOT_FOUND", "Recording was not found")
    }

    const [timelineRows, signalRows] = await Promise.all([
      prisma.$queryRaw<TimelineRow[]>`
        select
          sq.session_question_id::text,
          sq.question_order,
          sq.content as question_text,
          sq.source as question_source,
          sq.asked_at::text,
          ia.answer_id::text,
          ia.answer_text,
          ia.answered_at::text,
          iae.skill_score,
          iae.clarity_score,
          iae.depth_score,
          iae.confidence_score,
          iae.fraud_score,
          iae.feedback
        from public.session_questions sq
        left join public.interview_answers ia
          on ia.session_question_id = sq.session_question_id
        left join public.interview_answer_evaluations iae
          on iae.answer_id = ia.answer_id
        where sq.attempt_id = ${recording.attempt_id}::uuid
        order by sq.asked_at asc nulls last, sq.question_order asc nulls last
      `,
      prisma.$queryRaw<SignalRow[]>`
        select
          signal_id::text,
          type,
          value,
          created_at::text
        from public.interview_signals
        where attempt_id = ${recording.attempt_id}::uuid
        order by created_at asc nulls last
      `.catch(() => [] as SignalRow[]),
    ])

    const timeline = timelineRows.map((row, index) => {
      const questionOffset = offsetMs(recording.started_at, row.asked_at)
      const answerOffset = offsetMs(recording.started_at, row.answered_at)
      const fraudScore = toPercent(row.fraud_score)

      return {
        id: row.session_question_id,
        index: row.question_order ?? index + 1,
        question: row.question_text ?? "",
        source: row.question_source ?? "",
        answer: row.answer_text ?? "",
        askedAt: row.asked_at,
        answeredAt: row.answered_at,
        offsetMs: questionOffset ?? answerOffset ?? 0,
        answerOffsetMs: answerOffset,
        scores: {
          skill: toPercent(row.skill_score),
          clarity: toPercent(row.clarity_score),
          depth: toPercent(row.depth_score),
          confidence: toPercent(row.confidence_score),
          fraud: fraudScore,
        },
        feedback: row.feedback,
        riskLevel: fraudScore !== null && fraudScore >= 70 ? "high" : fraudScore !== null && fraudScore >= 45 ? "medium" : "low",
      }
    })

    const signals = signalRows.map((row) => {
      const fallbackOffset = offsetMs(recording.started_at, row.created_at)

      return {
        id: row.signal_id,
        type: row.type,
        label: getSignalLabel(row.type),
        severity: getSignalSeverity(row.type, row.value),
        occurredAt: row.created_at,
        offsetMs: readSignalOffset(row.value) ?? fallbackOffset ?? 0,
        value: row.value,
      }
    })

    return NextResponse.json({
      recording: {
        id: recording.recording_id,
        attemptId: recording.attempt_id,
        candidateName: recording.candidate_name,
        jobTitle: recording.job_title,
        status: recording.status,
        startedAt: recording.started_at,
        endedAt: recording.ended_at,
        createdAt: recording.created_at,
        transcript: recording.transcript,
        mediaUrl: `/api/recordings/${encodeURIComponent(recording.recording_id)}`,
      },
      timeline,
      signals,
      summary: {
        questionCount: timeline.length,
        signalCount: signals.length,
        highRiskCount: signals.filter((signal) => signal.severity === "high").length + timeline.filter((item) => item.riskLevel === "high").length,
        maxFraudScore: Math.max(0, ...timeline.map((item) => item.scores.fraud ?? 0)),
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
