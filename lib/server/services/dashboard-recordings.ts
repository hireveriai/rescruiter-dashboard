import { prisma } from "@/lib/server/prisma"

type RecordingColumnRow = {
  column_name: string
}

type DashboardRecordingRow = {
  recordingId: string
  candidateName: string
  jobTitle: string
  recordingUrl: string | null
  audioUrl: string | null
  transcriptPreview: string
  retentionDays: number | null
  expiresAt: string | null
  createdAt: string | null
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`
}

async function getRecordingColumns() {
  const rows = await prisma.$queryRaw<RecordingColumnRow[]>`
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'interview_recordings'
  `

  return new Set(rows.map((row) => row.column_name))
}

export async function getDashboardRecordings(organizationId: string): Promise<DashboardRecordingRow[]> {
  const columns = await getRecordingColumns()

  if (columns.size === 0) {
    return []
  }

  const idColumn = columns.has("recording_id") ? "recording_id" : columns.has("id") ? "id" : null
  const urlColumn = columns.has("audio_url") ? "audio_url" : columns.has("recording_url") ? "recording_url" : null

  if (!idColumn || !urlColumn) {
    return []
  }

  const joinInterviewExpression = columns.has("interview_id") ? "ir.interview_id" : "ia.interview_id"
  const attemptJoin = columns.has("attempt_id") ? "left join public.interview_attempts ia on ia.attempt_id = ir.attempt_id" : "left join public.interview_attempts ia on false"
  const transcriptExpression = columns.has("transcript")
    ? `
      case
        when ir.transcript is null or btrim(ir.transcript) = '' then 'Transcript not available yet'
        when char_length(regexp_replace(ir.transcript, '\\s+', ' ', 'g')) > 120
          then left(regexp_replace(ir.transcript, '\\s+', ' ', 'g'), 117) || '...'
        else regexp_replace(ir.transcript, '\\s+', ' ', 'g')
      end
    `
    : "'Transcript not available yet'"
  const retentionExpression = columns.has("retention_days") ? "coalesce(ir.retention_days, 30)" : "30"
  const expiresExpression = columns.has("expires_at") ? "ir.expires_at::text" : "null::text"
  const createdExpression = columns.has("created_at") ? "ir.created_at::text" : "null::text"

  const query = `
    select
      ir.${quoteIdentifier(idColumn)}::text as "recordingId",
      coalesce(c.full_name, 'Unknown Candidate') as "candidateName",
      coalesce(jp.job_title, '-') as "jobTitle",
      ir.${quoteIdentifier(urlColumn)}::text as "recordingUrl",
      ir.${quoteIdentifier(urlColumn)}::text as "audioUrl",
      ${transcriptExpression} as "transcriptPreview",
      ${retentionExpression}::int as "retentionDays",
      ${expiresExpression} as "expiresAt",
      ${createdExpression} as "createdAt"
    from public.interview_recordings ir
    ${attemptJoin}
    left join public.interviews i on i.interview_id = ${joinInterviewExpression}
    left join public.candidates c on c.candidate_id = i.candidate_id
    left join public.job_positions jp on jp.job_id = i.job_id
    where i.organization_id = $1::uuid
    order by ${columns.has("created_at") ? "ir.created_at desc nulls last" : `ir.${quoteIdentifier(idColumn)} desc`}
  `

  return prisma.$queryRawUnsafe<DashboardRecordingRow[]>(query, organizationId).catch(() => [])
}
