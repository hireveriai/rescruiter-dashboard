import { NextResponse } from "next/server"

import { upsertSkillState } from "@/lib/server/ai/skill-state"
import { errorResponse } from "@/lib/server/response"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const attemptId = body.attempt_id ?? body.attemptId
    const interviewId = body.interview_id ?? body.interviewId
    const organizationId = body.organization_id ?? body.organizationId
    const skillsCovered = Array.isArray(body.skills_covered) ? body.skills_covered : body.skillsCovered
    const skillsRemaining = Array.isArray(body.skills_remaining) ? body.skills_remaining : body.skillsRemaining

    if (!attemptId) {
      return NextResponse.json(
        { success: false, message: "attemptId is required" },
        { status: 400 }
      )
    }

    await upsertSkillState({
      attemptId,
      interviewId: interviewId ?? null,
      organizationId: organizationId ?? null,
      skillsCovered: Array.isArray(skillsCovered) ? skillsCovered : [],
      skillsRemaining: Array.isArray(skillsRemaining) ? skillsRemaining : [],
    })

    return NextResponse.json({
      success: true,
      data: {
        attempt_id: attemptId,
        skills_covered: Array.isArray(skillsCovered) ? skillsCovered : [],
        skills_remaining: Array.isArray(skillsRemaining) ? skillsRemaining : [],
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
