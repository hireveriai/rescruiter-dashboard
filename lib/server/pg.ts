import { Pool } from "pg"

const globalForPg = globalThis as unknown as {
  pgPool?: Pool
}

function getConnectionConfig() {
  const rawUrl = process.env.DATABASE_URL

  if (!rawUrl) {
    throw new Error("Missing DATABASE_URL")
  }

  const connectionUrl = new URL(rawUrl.trim().replace(/^"|"$/g, ""))
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
