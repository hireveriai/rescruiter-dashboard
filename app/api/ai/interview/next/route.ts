import { NextResponse } from "next/server"

import { decideNextQuestion, generateFollowUpWithAI } from "@/lib/server/ai/interview-flow"
import { fetchSkillState } from "@/lib/server/ai/skill-state"
import { errorResponse } from "@/lib/server/response"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const attemptId = body.attempt_id ?? body.attemptId
    let skillsRemaining = body.skills_remaining ?? body.skillsRemaining

    if ((!skillsRemaining || skillsRemaining.length === 0) && attemptId) {
      const state = await fetchSkillState(attemptId)
      skillsRemaining = state?.skills_remaining ?? []
    }

    const decision = decideNextQuestion({
      lastAnswer: body.last_answer ?? body.lastAnswer,
      skillScore: body.skill_score ?? body.skillScore,
      fraudScore: body.fraud_score ?? body.fraudScore,
      skillsRemaining: skillsRemaining ?? [],
      timeRemainingSeconds: body.time_remaining ?? body.timeRemaining,
      followupCount: body.followup_count ?? body.followupCount,
      lastQuestion: body.last_question ?? body.lastQuestion,
      criticalSkills: body.critical_skills ?? body.criticalSkills,
      experienceLevel: body.experience_level ?? body.experienceLevel,
    })

    const useAiFollowup =
      body.use_ai_followup ?? body.useAiFollowup ?? body.use_ai ?? body.useAi ?? true

    if (
      useAiFollowup &&
      decision.intent === "followup" &&
      decision.followUp &&
      (body.last_question ?? body.lastQuestion) &&
      (body.last_answer ?? body.lastAnswer)
    ) {
      decision.followUp = await generateFollowUpWithAI({
        lastQuestion: body.last_question ?? body.lastQuestion,
        candidateAnswer: body.last_answer ?? body.lastAnswer,
        skillScore: body.skill_score ?? body.skillScore,
        fraudScore: body.fraud_score ?? body.fraudScore,
      })
    }

    return NextResponse.json({ success: true, data: decision })
  } catch (error) {
    return errorResponse(error)
  }
}
