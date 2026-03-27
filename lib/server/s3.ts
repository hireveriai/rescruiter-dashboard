import { randomUUID } from "crypto"

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

function getRequiredEnv(name: string) {
  const value = process.env[name]

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

const region = getRequiredEnv("AWS_REGION")
const bucketName = getRequiredEnv("S3_BUCKET_NAME")

export const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: getRequiredEnv("AWS_ACCESS_KEY_ID"),
    secretAccessKey: getRequiredEnv("AWS_SECRET_ACCESS_KEY"),
  },
})

function buildObjectKey(fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-")
  return `${Date.now()}-${randomUUID()}-${safeName}`
}

function buildPublicUrl(key: string) {
  return `https://${bucketName}.s3.${region}.amazonaws.com/${key}`
}

export async function uploadFileToS3(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const key = buildObjectKey(file.name)

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: file.type || "application/octet-stream",
    })
  )

  return buildPublicUrl(key)
}
