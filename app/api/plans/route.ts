import { NextResponse } from "next/server"

import { errorResponse } from "@/lib/server/response"
import { getActiveBillingPlans } from "@/lib/server/services/billing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const selectedPlanSlug = searchParams.get("plan")?.trim().toLowerCase() || null
    const plans = await getActiveBillingPlans()
    const selectedPlan = selectedPlanSlug ? plans.find((plan) => plan.slug === selectedPlanSlug) ?? null : null
    const response = NextResponse.json({
      success: true,
      data: {
        plans,
        selectedPlan,
      },
    })

    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
    response.headers.set("Pragma", "no-cache")
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
