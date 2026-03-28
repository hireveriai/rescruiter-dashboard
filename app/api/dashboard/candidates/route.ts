import { getCandidatesDashboard } from "@/lib/server/services/dashboard.service"

function parseLimit(value) {
  if (!value || value === "all") {
    return value === "all" ? "all" : 5
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? 5 : parsed
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const data = await getCandidatesDashboard({
      limit: parseLimit(searchParams.get("limit")),
    })

    return Response.json({
      success: true,
      data,
    })
  } catch (err) {
    return Response.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Failed to fetch dashboard candidates",
      },
      { status: 500 }
    )
  }
}
