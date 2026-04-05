import { Pool } from "pg"

const globalForPg = globalThis as unknown as {
  pgPool?: Pool
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
    return new URL(normalizedUrl).toString()
  } catch {
    return normalizedUrl
  }
}

function getConnectionConfig() {
  const normalizedUrl = getNormalizedDatabaseUrl()
  const connectionUrl = new URL(normalizedUrl)
  const usesLocalDatabase =
    connectionUrl.hostname === "localhost" || connectionUrl.hostname === "127.0.0.1"

  connectionUrl.searchParams.delete("sslmode")
  connectionUrl.searchParams.delete("sslcert")
  connectionUrl.searchParams.delete("sslkey")
  connectionUrl.searchParams.delete("sslrootcert")

  return {
    connectionString: connectionUrl.toString(),
    ssl: usesLocalDatabase ? false : { rejectUnauthorized: false },
    max: 1,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  }
}

export const pgPool =
  globalForPg.pgPool ??
  new Pool(getConnectionConfig())

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pgPool
}
