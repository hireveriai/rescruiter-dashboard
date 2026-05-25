import { z } from "zod"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse, successResponse } from "@/lib/server/response"
import { createRazorpayOrder } from "@/lib/server/services/billing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const createOrderSchema = z.object({
  plan: z.string().trim().min(1),
  addon_plan: z.string().trim().optional().nullable(),
  coupon_code: z.string().trim().optional().nullable(),
})

export async function POST(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const body = await request.json()
    const input = createOrderSchema.parse(body)
    const order = await createRazorpayOrder({
      auth,
      planSlug: input.plan,
      addonPlanSlug: input.addon_plan,
      couponCode: input.coupon_code,
    })

    return successResponse(order)
  } catch (error) {
    return errorResponse(error)
  }
}
