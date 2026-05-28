import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { getVerisSummaryCards } from "@/lib/server/services/reports.service"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const { searchParams } = new URL(request.url)
    const rawLimit = searchParams.get("limit")
    const rawOffset = Number.parseInt(searchParams.get("offset") ?? "0", 10)
    const limit = rawLimit === "all" ? null : Math.min(Math.max(Number(rawLimit || 6) || 6, 1), 50)
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0
    const startedAt = Date.now()
    const cards = await getVerisSummaryCards(auth.organizationId, limit, offset)

    const response = NextResponse.json({
      success: true,
      data: cards,
    })

    response.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=120")
    response.headers.set("Server-Timing", `veris;dur=${Date.now() - startedAt}`)
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
