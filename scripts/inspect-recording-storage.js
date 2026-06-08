require("dotenv").config({ path: ".env.local" })

async function list(prefix) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "")
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "recordings"

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase storage configuration")
  }

  const response = await fetch(`${supabaseUrl}/storage/v1/object/list/${encodeURIComponent(bucket)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      prefix,
      limit: 100,
      offset: 0,
      sortBy: {
        column: "name",
        order: "asc",
      },
    }),
  })
  const payload = await response.json().catch(() => null)

  console.log(JSON.stringify({
    bucket,
    prefix,
    status: response.status,
    payload,
  }, null, 2))
}

list(process.argv[2] || "")
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
