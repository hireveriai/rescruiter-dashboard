import { z } from "zod"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse, successResponse } from "@/lib/server/response"
import { markPaymentTerminal } from "@/lib/server/services/billing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const paymentFailedSchema = z.object({
  razorpay_order_id: z.string().trim().min(1),
  status: z.enum(["failed", "cancelled"]),
  reason: z.string().trim().max(500).optional().nullable(),
})

export async function POST(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const body = await request.json()
    const input = paymentFailedSchema.parse(body)
    const result = await markPaymentTerminal({
      auth,
      razorpayOrderId: input.razorpay_order_id,
      status: input.status,
      reason: input.reason,
    })

    return successResponse(result)
  } catch (error) {
    return errorResponse(error)
  }
}
