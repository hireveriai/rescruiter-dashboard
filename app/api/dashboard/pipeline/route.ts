import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/server/currentUser"
import { prisma } from "@/lib/server/prisma"

type PipelineSummaryRow = {
  pending_count: number | bigint | null
  in_progress_count: number | bigint | null
  completed_count: number | bigint | null
  flagged_count: number | bigint | null
}

type PendingInviteRow = {
  invite_id: string
  candidate_name: string
  job_title: string
  token: string
  created_at: Date | string
  expires_at: Date | string | null
  access_type: string | null
  start_time: Date | string | null
  end_time: Date | string | null
}

type RecordingRow = {
  recording_id: string
  candidate_name: string
  job_title: string
  audio_url: string | null
  transcript: string | null
  retention_days: number | null
  expires_at: Date | string | null
  created_at: Date | string | null
}

function toNumber(value: number | bigint | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value)
  }

  return value ?? 0
}

function getTranscriptPreview(transcript: string | null) {
  if (!transcript) {
    return "Transcript not available yet"
  }

  const normalized = transcript.replace(/\s+/g, " ").trim()
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized
}

export async function GET() {
  try {
    const user = getCurrentUser()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    const [summaryRows, pendingRows, recordingRows] = await Promise.all([
      prisma.$queryRaw<PipelineSummaryRow[]>(Prisma.sql`
        select
          count(*) filter (
            where coalesce(ii.status, 'ACTIVE') = 'ACTIVE'
              and ii.used_at is null
              and (ii.expires_at is null or ii.expires_at > now())
          ) as pending_count,
          count(*) filter (
            where ii.used_at is not null
              and coalesce(ii.status, 'ACTIVE') = 'ACTIVE'
          ) as in_progress_count,
          count(*) filter (
            where coalesce(ii.status, '') = 'USED'
          ) as completed_count,
          count(*) filter (
            where coalesce(ii.status, '') = 'REVOKED'
          ) as flagged_count
        from public.interview_invites ii
        inner join public.interviews i on i.interview_id = ii.interview_id
        where i.organization_id = ${user.organizationId}::uuid
      `),
      prisma.$queryRaw<PendingInviteRow[]>(Prisma.sql`
        select
          ii.invite_id,
          c.full_name as candidate_name,
          jp.job_title,
          ii.token,
          ii.created_at,
          ii.expires_at,
          ii.access_type,
          ii.start_time,
          ii.end_time
        from public.interview_invites ii
        inner join public.interviews i on i.interview_id = ii.interview_id
        inner join public.candidates c on c.candidate_id = i.candidate_id
        inner join public.job_positions jp on jp.job_id = i.job_id
        where i.organization_id = ${user.organizationId}::uuid
          and coalesce(ii.status, 'ACTIVE') = 'ACTIVE'
          and ii.used_at is null
          and (ii.expires_at is null or ii.expires_at > now())
        order by ii.created_at desc
      `),
      prisma.$queryRaw<RecordingRow[]>(Prisma.sql`
        select
          ir.recording_id,
          c.full_name as candidate_name,
          jp.job_title,
          ir.audio_url,
          ir.transcript,
          ir.retention_days,
          ir.expires_at,
          ir.created_at
        from public.interview_recordings ir
        inner join public.interview_attempts ia on ia.attempt_id = ir.attempt_id
        inner join public.interviews i on i.interview_id = ia.interview_id
        inner join public.candidates c on c.candidate_id = i.candidate_id
        inner join public.job_positions jp on jp.job_id = i.job_id
        where i.organization_id = ${user.organizationId}::uuid
        order by ir.created_at desc nulls last
      `),
    ])

    const summary = summaryRows[0]

    return NextResponse.json({
      success: true,
      data: {
        pipeline: {
          pending: toNumber(summary?.pending_count),
          inProgress: toNumber(summary?.in_progress_count),
          completed: toNumber(summary?.completed_count),
          flagged: toNumber(summary?.flagged_count),
        },
        pendingInterviews: pendingRows.map((row) => ({
          inviteId: row.invite_id,
          candidateName: row.candidate_name,
          jobTitle: row.job_title,
          accessType: row.access_type ?? "FLEXIBLE",
          createdAt: row.created_at,
          startTime: row.start_time,
          endTime: row.end_time,
          expiresAt: row.expires_at,
          link: `${appUrl}/interview/${row.token}`,
        })),
        recordedInterviews: recordingRows.map((row) => ({
          recordingId: row.recording_id,
          candidateName: row.candidate_name,
          jobTitle: row.job_title,
          audioUrl: row.audio_url,
          transcriptPreview: getTranscriptPreview(row.transcript),
          retentionDays: row.retention_days ?? 30,
          expiresAt: row.expires_at,
          createdAt: row.created_at,
        })),
      },
    })
  } catch (error) {
    console.error("Failed to fetch interview pipeline", error)

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch interview pipeline",
      },
      { status: 500 }
    )
  }
}
