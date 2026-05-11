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
  storagePath: string | null
  hasRecordingFile: boolean
  transcriptPreview: string
  retentionDays: number | null
  expiresAt: string | null
  createdAt: string | null
}

type StorageListItem = {
  name: string
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`
}

function buildRecordingPlaybackUrl(recordingId: string) {
  return `/api/recordings/${encodeURIComponent(recordingId)}`
}

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "") || null
}

function getStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || "recordings"
}

function extractStoragePath(value: string | null) {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  const supabaseUrl = getSupabaseUrl()

  if (!trimmed) {
    return null
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const parsedUrl = new URL(trimmed)
    const prefixes = ["/storage/v1/object/public/", "/storage/v1/object/sign/", "/storage/v1/object/"]
    const matchingPrefix = prefixes.find((prefix) => parsedUrl.pathname.includes(prefix))

    if (!supabaseUrl || parsedUrl.origin !== supabaseUrl || !matchingPrefix) {
      return null
    }

    const objectParts = decodeURIComponent(parsedUrl.pathname.slice(parsedUrl.pathname.indexOf(matchingPrefix) + matchingPrefix.length)).split("/").filter(Boolean)
    objectParts.shift()
    return objectParts.join("/") || null
  }

  return trimmed.replace(/^\/+/, "") || null
}

async function listRecordingObjectPaths() {
  const supabaseUrl = getSupabaseUrl()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const bucket = getStorageBucket()

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  const response = await fetch(`${supabaseUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      prefix: "recordings",
      limit: 1000,
      offset: 0,
      sortBy: {
        column: "name",
        order: "asc",
      },
    }),
  })

  if (!response.ok) {
    return null
  }

  const items = await response.json().catch(() => null) as StorageListItem[] | null

  if (!Array.isArray(items)) {
    return null
  }

  return new Set(items.map((item) => `recordings/${item.name}`))
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
  const filePathExpression = columns.has("file_path") ? "ir.file_path::text" : "null::text"

  const query = `
    select
      ir.${quoteIdentifier(idColumn)}::text as "recordingId",
      coalesce(c.full_name, 'Unknown Candidate') as "candidateName",
      coalesce(jp.job_title, '-') as "jobTitle",
      ir.${quoteIdentifier(urlColumn)}::text as "recordingUrl",
      ir.${quoteIdentifier(urlColumn)}::text as "audioUrl",
      ${filePathExpression} as "storagePath",
      true as "hasRecordingFile",
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

  const rows = await prisma.$queryRawUnsafe<DashboardRecordingRow[]>(query, organizationId).catch(() => [])
  const existingObjectPaths = await listRecordingObjectPaths()

  return rows.map((row) => ({
    ...row,
    storagePath: row.storagePath || extractStoragePath(row.recordingUrl),
    hasRecordingFile: existingObjectPaths ? existingObjectPaths.has(row.storagePath || extractStoragePath(row.recordingUrl) || "") : true,
    recordingUrl: existingObjectPaths && !existingObjectPaths.has(row.storagePath || extractStoragePath(row.recordingUrl) || "")
      ? null
      : buildRecordingPlaybackUrl(row.recordingId),
    audioUrl: existingObjectPaths && !existingObjectPaths.has(row.storagePath || extractStoragePath(row.recordingUrl) || "")
      ? null
      : buildRecordingPlaybackUrl(row.recordingId),
  }))
}
