import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { getCandidatesScreenData } from "@/lib/server/services/recruiter-screen-data"

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
    const includeAnswerSummaries = searchParams.get("includeAnswerSummaries") === "1"
    const limit = parseLimit(searchParams.get("limit"))
    const data = await getCandidatesScreenData(auth, {
      includeAnswerSummaries,
      limit,
    })

    const response = Response.json({
      success: true,
      data,
    })

    response.headers.set("Cache-Control", includeAnswerSummaries ? "no-store" : "private, max-age=10, stale-while-revalidate=30")
    return response
  } catch (err) {
    return errorResponse(err)
  }
}
