import { randomUUID } from "crypto"

import { ApiError } from "@/lib/server/errors"

type UploadInvoiceInput = {
  organizationId: string
  invoiceNumber: string
  buffer: Buffer
}

type StoredInvoice = {
  bucket: string
  key: string
  url: string
}

function getConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "")
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const bucket = process.env.BILLING_INVOICE_BUCKET?.trim() || "invoices"

  if (!supabaseUrl || !serviceRoleKey) {
    throw new ApiError(500, "INVOICE_STORAGE_NOT_CONFIGURED", "Invoice storage is not configured")
  }

  return { supabaseUrl, serviceRoleKey, bucket }
}

function sanitizePathPart(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-") || "invoice"
}

function encodeObjectPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/")
}

export async function uploadInvoicePdf(input: UploadInvoiceInput): Promise<StoredInvoice> {
  const { supabaseUrl, serviceRoleKey, bucket } = getConfig()
  const key = [
    "billing",
    input.organizationId,
    `${sanitizePathPart(input.invoiceNumber)}-${randomUUID()}.pdf`,
  ].join("/")
  const encodedPath = encodeObjectPath(key)
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
      "Content-Type": "application/pdf",
      "x-upsert": "false",
    },
    body,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new ApiError(
      502,
      "INVOICE_STORAGE_UPLOAD_FAILED",
      errorText || `Invoice storage upload failed with status ${response.status}`
    )
  }

  return {
    bucket,
    key,
    url: `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`,
  }
}

export async function downloadInvoicePdf(input: {
  bucket: string
  key: string
}) {
  const { supabaseUrl, serviceRoleKey } = getConfig()
  const encodedPath = encodeObjectPath(input.key)
  const downloadUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(input.bucket)}/${encodedPath}`
  const response = await fetch(downloadUrl, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => "")
    throw new ApiError(
      response.status === 404 ? 404 : 502,
      response.status === 404 ? "INVOICE_PDF_NOT_FOUND" : "INVOICE_STORAGE_DOWNLOAD_FAILED",
      errorText || `Invoice storage download failed with status ${response.status}`
    )
  }

  return Buffer.from(await response.arrayBuffer())
}
