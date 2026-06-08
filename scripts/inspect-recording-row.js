require("dotenv").config({ path: ".env.local" })

const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

async function main() {
  const recordingId = process.argv[2]

  if (!recordingId) {
    throw new Error("Usage: node scripts/inspect-recording-row.js <recording-id>")
  }

  const columns = await prisma.$queryRawUnsafe(
    "select column_name from information_schema.columns where table_schema='public' and table_name='interview_recordings' order by ordinal_position"
  )
  const idColumns = columns
    .map((column) => column.column_name)
    .filter((columnName) => columnName === "recording_id" || columnName === "id")

  if (idColumns.length === 0) {
    console.log(JSON.stringify({ columns, rows: [] }, null, 2))
    return
  }

  const where = idColumns.map((columnName, index) => `${columnName}::text = $${index + 1}`).join(" or ")
  const rows = await prisma.$queryRawUnsafe(
    `select * from public.interview_recordings where ${where} limit 1`,
    ...idColumns.map(() => recordingId)
  )

  console.log(JSON.stringify({
    columns: columns.map((column) => column.column_name),
    rows,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
