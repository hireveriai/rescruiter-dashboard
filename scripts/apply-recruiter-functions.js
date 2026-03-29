const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.join(process.cwd(), ".env.local") });

function normalizeDatabaseUrl(url) {
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  const parsed = new URL(url);
  ["sslmode", "ssl", "channel_binding"].forEach((key) => parsed.searchParams.delete(key));
  return parsed.toString();
}

async function main() {
  const sqlPath = path.join(process.cwd(), "db", "recruiter_backend_functions.sql");
  const sql = fs.readFileSync(sqlPath, "utf8").replace(/^\\uFEFF/, "");

  const pool = new Pool({
    connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  try {
    await pool.query(sql);
    console.log("Applied recruiter backend functions successfully.");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
