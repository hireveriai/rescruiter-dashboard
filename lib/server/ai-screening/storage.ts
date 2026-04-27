import { randomUUID } from "crypto"

import { ApiError } from "@/lib/server/errors"

type UploadResumeInput = {
  organizationId: string
  fileName: string
  contentType?: string | null
  buffer: Buffer
}

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "")
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const bucket =
    process.env.AI_SCREENING_RESUME_BUCKET?.trim() ||
    process.env.SUPABASE_RESUME_BUCKET?.trim() ||
    "resumes"

  if (!supabaseUrl || !serviceRoleKey) {
    throw new ApiError(
      500,
      "SUPABASE_STORAGE_NOT_CONFIGURED",
      "Supabase storage credentials are not configured"
    )
  }

  return { supabaseUrl, serviceRoleKey, bucket }
}

function sanitizeFileName(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-")
  return safeName || "resume"
}

function encodeObjectPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/")
}

export async function uploadResumeToSupabaseStorage(input: UploadResumeInput) {
  const { supabaseUrl, serviceRoleKey, bucket } = getConfig()
  const objectKey = [
    "ai-screening",
    input.organizationId,
    `${Date.now()}-${randomUUID()}-${sanitizeFileName(input.fileName)}`,
  ].join("/")
  const encodedPath = encodeObjectPath(objectKey)
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`
  const body = input.buffer.buffer.slice(
    input.buffer.byteOffset,
    input.buffer.byteOffset + input.buffer.byteLength
  ) as ArrayBuffer

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": input.contentType || "application/octet-stream",
      "x-upsert": "false",
    },
    body,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new ApiError(
      502,
      "SUPABASE_STORAGE_UPLOAD_FAILED",
      errorText || `Supabase storage upload failed with status ${response.status}`
    )
  }

  return {
    bucket,
    key: objectKey,
    url: `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`,
  }
}
