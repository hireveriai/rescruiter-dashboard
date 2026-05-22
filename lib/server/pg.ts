import { Pool } from "pg"

const globalForPg = globalThis as unknown as {
  pgPool?: Pool
}

function getRawDatabaseUrl() {
  return (
    process.env.DB_POOL_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  )
}

function shouldForceTransactionPooler() {
  return process.env.DB_POOL_MODE !== "session"
}

function getNormalizedDatabaseUrl() {
  const rawUrl = getRawDatabaseUrl()

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
  const usesSupabasePooler = connectionUrl.hostname.endsWith(".pooler.supabase.com")

  if (shouldForceTransactionPooler() && usesSupabasePooler && (!connectionUrl.port || connectionUrl.port === "5432")) {
    connectionUrl.port = "6543"
  }

  connectionUrl.searchParams.delete("sslmode")
  connectionUrl.searchParams.delete("sslcert")
  connectionUrl.searchParams.delete("sslkey")
  connectionUrl.searchParams.delete("sslrootcert")

  return {
    connectionString: connectionUrl.toString(),
    ssl: usesLocalDatabase ? false : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX || 1),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 1000),
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 5000),
  }
}

export const pgPool =
  globalForPg.pgPool ??
  new Pool(getConnectionConfig())

if (process.env.NODE_ENV !== "production") {
  globalForPg.pgPool = pgPool
}
