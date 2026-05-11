import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { prisma } from "@/lib/server/prisma"
import { errorResponse } from "@/lib/server/response"

type RecordingColumnRow = {
  column_name: string
}

type RecordingLookupRow = {
  recording_id: string
  recording_url: string | null
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`
}

function getSupabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "") || null
}

function getStorageBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET?.trim() || "recordings"
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

function normalizeStorageLocation(value: string) {
  const fallbackBucket = getStorageBucket()
  const supabaseUrl = getSupabaseUrl()
  const trimmed = value.trim()

  if (!trimmed) {
    throw new ApiError(404, "RECORDING_URL_MISSING", "Recording URL is missing")
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const parsedUrl = new URL(trimmed)
    const publicPrefix = "/storage/v1/object/public/"
    const signedPrefix = "/storage/v1/object/sign/"
    const objectPrefix = "/storage/v1/object/"
    const matchingPrefix = [publicPrefix, signedPrefix, objectPrefix].find((prefix) => parsedUrl.pathname.includes(prefix))

    if (!supabaseUrl || parsedUrl.origin !== supabaseUrl || !matchingPrefix) {
      return {
        bucket: null,
        path: null,
        directUrl: trimmed,
      }
    }

    const objectParts = decodeURIComponent(parsedUrl.pathname.slice(parsedUrl.pathname.indexOf(matchingPrefix) + matchingPrefix.length)).split("/").filter(Boolean)
    const bucket = objectParts.shift() || fallbackBucket
    const path = objectParts.join("/")

    return {
      bucket,
      path,
      directUrl: trimmed,
    }
  }

  const withoutLeadingSlash = trimmed.replace(/^\/+/, "")
  return {
    bucket: fallbackBucket,
    path: withoutLeadingSlash,
    directUrl: null,
  }
}

async function requestSignedUrl(bucket: string, path: string) {
  const supabaseUrl = getSupabaseUrl()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  const encodedPath = path.split("/").map(encodeURIComponent).join("/")
  const response = await fetch(`${supabaseUrl}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${encodedPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      expiresIn: 60 * 30,
    }),
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload?.signedURL) {
    return {
      ok: false as const,
      status: response.status,
      message: payload?.message || payload?.error || "Unable to create recording playback URL",
    }
  }

  const signedPath = String(payload.signedURL)
  const signedUrl = signedPath.startsWith("http")
    ? signedPath
    : signedPath.startsWith("/storage/v1/")
      ? `${supabaseUrl}${signedPath}`
      : `${supabaseUrl}/storage/v1${signedPath.startsWith("/") ? signedPath : `/${signedPath}`}`

  return {
    ok: true as const,
    signedUrl,
  }
}

async function createSignedUrl(bucket: string, path: string) {
  const fallbackBucket = getStorageBucket()
  const strippedFallbackPath = path.startsWith(`${fallbackBucket}/`) ? path.slice(fallbackBucket.length + 1) : null
  const candidates = [
    { bucket, path },
    ...(strippedFallbackPath ? [{ bucket, path: strippedFallbackPath }] : []),
    ...(bucket !== fallbackBucket ? [{ bucket: fallbackBucket, path }] : []),
    ...(bucket !== fallbackBucket && strippedFallbackPath ? [{ bucket: fallbackBucket, path: strippedFallbackPath }] : []),
  ]
  let lastFailure: { status: number; message: string } | null = null

  for (const candidate of candidates) {
    const result = await requestSignedUrl(candidate.bucket, candidate.path)

    if (!result) {
      return null
    }

    if (result.ok) {
      return result.signedUrl
    }

    lastFailure = {
      status: result.status,
      message: result.message,
    }
  }

  throw new ApiError(
    lastFailure?.status === 400 && /not found/i.test(lastFailure.message) ? 404 : lastFailure?.status ?? 500,
    "RECORDING_FILE_MISSING",
    lastFailure?.message && /not found/i.test(lastFailure.message)
      ? "The recording row exists, but the video file is missing from Supabase Storage."
      : lastFailure?.message || "Unable to create recording playback URL"
  )
}

export async function GET(_request: Request, context: { params: Promise<{ recordingId: string }> }) {
  try {
    const auth = await getRecruiterRequestContext(_request)
    const { recordingId } = await context.params
    const columns = await getRecordingColumns()
    const idColumn = columns.has("recording_id") ? "recording_id" : columns.has("id") ? "id" : null
    const urlColumn = columns.has("audio_url") ? "audio_url" : columns.has("recording_url") ? "recording_url" : null

    if (!idColumn || !urlColumn) {
      throw new ApiError(404, "RECORDINGS_SCHEMA_UNAVAILABLE", "Recording storage columns are not available")
    }

    const joinInterviewExpression = columns.has("interview_id") ? "ir.interview_id" : "ia.interview_id"
    const attemptJoin = columns.has("attempt_id") ? "left join public.interview_attempts ia on ia.attempt_id = ir.attempt_id" : "left join public.interview_attempts ia on false"
    const rows = await prisma.$queryRawUnsafe<RecordingLookupRow[]>(
      `
        select
          ir.${quoteIdentifier(idColumn)}::text as recording_id,
          ir.${quoteIdentifier(urlColumn)}::text as recording_url
        from public.interview_recordings ir
        ${attemptJoin}
        left join public.interviews i on i.interview_id = ${joinInterviewExpression}
        where ir.${quoteIdentifier(idColumn)}::text = $1
          and i.organization_id = $2::uuid
        limit 1
      `,
      recordingId,
      auth.organizationId
    )

    const recording = rows[0]

    if (!recording?.recording_url) {
      throw new ApiError(404, "RECORDING_NOT_FOUND", "Recording was not found")
    }

    const location = normalizeStorageLocation(recording.recording_url)

    if (location.bucket && location.path) {
      const signedUrl = await createSignedUrl(location.bucket, location.path)

      if (signedUrl) {
        return NextResponse.redirect(signedUrl)
      }
    }

    if (location.directUrl) {
      return NextResponse.redirect(location.directUrl)
    }

    throw new ApiError(404, "RECORDING_URL_INVALID", "Recording URL is invalid")
  } catch (error) {
    return errorResponse(error)
  }
}
