import { randomUUID } from "crypto"

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

function getRequiredEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

function getOptionalEnv(name: string) {
  const value = process.env[name]
  return value && value.trim() ? value : null
}

const region = getOptionalEnv("AWS_REGION")
const bucketName = getOptionalEnv("S3_BUCKET_NAME")
const customEndpoint = process.env.S3_ENDPOINT?.trim() || null
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || null
const explicitPublicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.trim() || null
const accessKeyId = getOptionalEnv("AWS_ACCESS_KEY_ID")
const secretAccessKey = getOptionalEnv("AWS_SECRET_ACCESS_KEY")

const s3Configured = Boolean(region && bucketName && accessKeyId && secretAccessKey)

export const s3Client = s3Configured
  ? new S3Client({
      region: region!,
      ...(customEndpoint
        ? {
            endpoint: customEndpoint,
            forcePathStyle: true,
          }
        : {}),
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    })
  : null

function buildObjectKey(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-")
  return `${Date.now()}-${randomUUID()}-${safeName}`
}

function buildPublicUrl(key: string) {
  if (explicitPublicBaseUrl) {
    return `${explicitPublicBaseUrl.replace(/\/+$/, "")}/${key}`
  }

  if (supabaseUrl) {
    return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${bucketName ?? "storage"}/${key}`
  }

  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`
}

export async function uploadFileToS3(file: File) {
  if (!s3Configured || !s3Client || !bucketName || !region) {
    return null
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  return uploadBufferToS3({
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    buffer,
  })
}

export async function uploadBufferToS3(input: {
  fileName: string
  contentType?: string | null
  buffer: Buffer
}) {
  if (!s3Configured || !s3Client || !bucketName || !region) {
    return null
  }

  const { fileName, contentType, buffer } = input
  const key = buildObjectKey(fileName)

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    })
  )

  return buildPublicUrl(key)
}

