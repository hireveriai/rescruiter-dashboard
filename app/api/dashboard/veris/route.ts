import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { getVerisSummaryCards } from "@/lib/server/services/reports.service"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const cards = await getVerisSummaryCards(auth.organizationId, 6)

    return NextResponse.json({
      success: true,
      data: cards,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
