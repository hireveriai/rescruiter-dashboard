import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function getNormalizedDatabaseUrl() {
  const rawUrl = process.env.DATABASE_URL

  if (!rawUrl) {
    throw new Error("Missing DATABASE_URL")
  }

  const trimmedUrl = rawUrl.trim().replace(/^"|"$/g, "")
  const protocolSeparatorIndex = trimmedUrl.indexOf("://")

  if (protocolSeparatorIndex === -1) {
    return trimmedUrl
  }

  const authAndHost = trimmedUrl.slice(protocolSeparatorIndex + 3)
  const atIndex = authAndHost.lastIndexOf("@")

  if (atIndex === -1) {
    return trimmedUrl
  }

  const protocol = trimmedUrl.slice(0, protocolSeparatorIndex)
  const credentials = authAndHost.slice(0, atIndex)
  const hostAndPath = authAndHost.slice(atIndex + 1)
  const credentialSeparatorIndex = credentials.indexOf(":")

  if (credentialSeparatorIndex === -1) {
    return trimmedUrl
  }

  const username = credentials.slice(0, credentialSeparatorIndex)
  const password = credentials.slice(credentialSeparatorIndex + 1)
  const normalizedUrl = `${protocol}://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${hostAndPath}`

  try {
    const parsedUrl = new URL(normalizedUrl)

    if (!parsedUrl.searchParams.has("connection_limit")) {
      parsedUrl.searchParams.set("connection_limit", "1")
    }

    if (!parsedUrl.searchParams.has("pool_timeout")) {
      parsedUrl.searchParams.set("pool_timeout", "20")
    }

    return parsedUrl.toString()
  } catch {
    return normalizedUrl
  }
}

const normalizedDatabaseUrl = getNormalizedDatabaseUrl()

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: normalizedDatabaseUrl,
      },
    },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
