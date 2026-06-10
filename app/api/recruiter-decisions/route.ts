import { NextResponse } from "next/server"
import { z } from "zod"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { upsertRecruiterDecisionScreenData } from "@/lib/server/services/recruiter-screen-writes"
import { normalizeRecruiterDecisionStatus } from "@/lib/server/services/recruiter-decisions"

const decisionSchema = z.object({
  candidateId: z.string().uuid(),
  interviewId: z.string().uuid().nullable().optional(),
  attemptId: z.string().uuid().nullable().optional(),
  status: z.string().trim().min(1),
  notes: z.string().trim().max(4000).nullable().optional(),
})

export async function POST(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const body = await request.json().catch(() => ({}))
    const input = decisionSchema.parse(body)
    const status = normalizeRecruiterDecisionStatus(input.status)

    if (!status) {
      return NextResponse.json({
        success: false,
        error: { message: "Unsupported recruiter decision status." },
      }, { status: 400 })
    }

    const decision = await upsertRecruiterDecisionScreenData({
      organizationId: auth.organizationId,
      userId: auth.userId,
      candidateId: input.candidateId,
      interviewId: input.interviewId ?? null,
      attemptId: input.attemptId ?? null,
      status,
      notes: input.notes ?? null,
    })

    if (!decision) {
      return NextResponse.json({
        success: false,
        error: { message: "Candidate or interview was not found in this workspace." },
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: decision,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
