import { NextResponse } from "next/server"

import { scoreAnswer, updateSkillState } from "@/lib/server/ai/interview-flow"
import { fetchSkillState, upsertSkillState } from "@/lib/server/ai/skill-state"
import { errorResponse } from "@/lib/server/response"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const attemptId = body.attempt_id ?? body.attemptId
    const interviewId = body.interview_id ?? body.interviewId
    const organizationId = body.organization_id ?? body.organizationId
    const skill = body.skill
    const answer = body.answer ?? ""

    if (!attemptId || !skill) {
      return NextResponse.json(
        { success: false, message: "attemptId and skill are required" },
        { status: 400 }
      )
    }

    const state = await fetchSkillState(attemptId)
    const skillsCovered = state?.skills_covered ?? []
    const skillsRemaining = state?.skills_remaining ?? []

    const updated = updateSkillState({
      skill,
      skillsCovered,
      skillsRemaining,
    })

    await upsertSkillState({
      attemptId,
      interviewId,
      organizationId,
      skillsCovered: updated.skills_covered,
      skillsRemaining: updated.skills_remaining,
    })

    const skillScore = scoreAnswer(skill, answer)

    return NextResponse.json({
      success: true,
      data: {
        skill,
        skill_score: skillScore,
        skills_covered: updated.skills_covered,
        skills_remaining: updated.skills_remaining,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
