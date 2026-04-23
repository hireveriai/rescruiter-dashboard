import { NextResponse } from "next/server"

import { generateInterviewQuestions } from "@/lib/interview-flow"
import { upsertSkillState } from "@/lib/server/ai/skill-state"
import { errorResponse } from "@/lib/server/response"

export async function POST(request: Request) {
  try {
    console.log("🚀 USING NEW QUESTION PIPELINE")
    const body = await request.json()

    const requireAi =
      body.require_ai_generation ?? body.requireAiGeneration ?? body.require_ai ?? body.requireAi ?? false
    const interviewId = body.interview_id ?? body.interviewId
    console.log("INTERVIEW ID:", interviewId ?? null)

    const requestedSkills = Array.isArray(body.core_skills ?? body.coreSkills)
      ? (body.core_skills ?? body.coreSkills)
      : []

    const questions = await generateInterviewQuestions({
        jobDescription: body.job_description ?? body.jobDescription,
        coreSkills: requestedSkills,
        candidateResumeText: body.candidate_resume ?? body.candidateResume,
        candidateResumeSkills: body.resume_skills ?? body.resumeSkills,
        experienceLevel: body.experience_level ?? body.experienceLevel,
        totalQuestions: body.total_questions ?? body.totalQuestions,
        interviewDurationMinutes:
          body.interview_duration_minutes ?? body.interviewDurationMinutes,
        jobTitle: body.job_title ?? body.jobTitle,
        previousQuestions: body.previous_questions ?? body.previousQuestions,
        similarityThreshold: body.similarity_threshold ?? body.similarityThreshold,
      })
    console.log("GENERATED QUESTIONS:", questions)

    const coveredSkills = Array.from(new Set(questions.map((question) => question.skill)))
    const remainingSkills = requestedSkills.filter((skill: string) =>
      !coveredSkills.some((covered) => covered.toLowerCase() === String(skill).toLowerCase())
    )
    const output = {
      questions,
      skills_covered: coveredSkills,
      skills_remaining: remainingSkills,
      meta: {
        role_confidence: 1,
        adaptive_mode: false,
      },
    }

    if (requireAi && output.questions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_GENERATION_REQUIRED",
            message: "AI question generation was required but failed.",
          },
        },
        { status: 502 }
      )
    }

    const attemptId = body.attempt_id ?? body.attemptId
    const organizationId = body.organization_id ?? body.organizationId

    if (attemptId) {
      await upsertSkillState({
        attemptId,
        interviewId,
        organizationId,
        skillsCovered: output.skills_covered,
        skillsRemaining: output.skills_remaining,
        roleConfidence:
          typeof output.meta?.role_confidence === "number" ? output.meta.role_confidence : null,
        adaptiveMode:
          typeof output.meta?.adaptive_mode === "boolean" ? output.meta.adaptive_mode : null,
      })
    }

    return NextResponse.json({ success: true, data: output })
  } catch (error) {
    return errorResponse(error)
  }
}
