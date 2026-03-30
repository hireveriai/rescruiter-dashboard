import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { getCandidatesDashboard } from "@/lib/server/services/dashboard.service"
import { errorResponse } from "@/lib/server/response"

function parseLimit(value: string | null): number | "all" {
  if (!value || value === "all") {
    return value === "all" ? "all" : 5
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? 5 : parsed
}

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const { searchParams } = new URL(request.url)
    const data = await getCandidatesDashboard({
      organizationId: auth.organizationId,
      limit: parseLimit(searchParams.get("limit")),
    })

    return Response.json({
      success: true,
      data,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
