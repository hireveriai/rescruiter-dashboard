import { NextResponse } from "next/server"

import {
  generateBaseInterviewQuestions,
  generateBaseInterviewQuestionsAI,
} from "@/lib/server/ai/interview-flow"
import { upsertSkillState } from "@/lib/server/ai/skill-state"
import { errorResponse } from "@/lib/server/response"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const useAiGeneration =
      body.use_ai_generation ?? body.useAiGeneration ?? body.use_ai ?? body.useAi ?? true
    const requireAi =
      body.require_ai_generation ?? body.requireAiGeneration ?? body.require_ai ?? body.requireAi ?? false

    const output = useAiGeneration
      ? await generateBaseInterviewQuestionsAI(
          {
            jobDescription: body.job_description ?? body.jobDescription,
            coreSkills: body.core_skills ?? body.coreSkills,
            candidateResumeText: body.candidate_resume ?? body.candidateResume,
            candidateResumeSkills: body.resume_skills ?? body.resumeSkills,
            experienceLevel: body.experience_level ?? body.experienceLevel,
            totalQuestions: body.total_questions ?? body.totalQuestions,
            interviewDurationMinutes: body.interview_duration_minutes ?? body.interviewDurationMinutes,
            jobTitle: body.job_title ?? body.jobTitle,
            previousQuestions: body.previous_questions ?? body.previousQuestions,
            similarityThreshold: body.similarity_threshold ?? body.similarityThreshold,
          },
          { requireAi }
        )
      : generateBaseInterviewQuestions({
        jobDescription: body.job_description ?? body.jobDescription,
        coreSkills: body.core_skills ?? body.coreSkills,
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

    const errorMessage =
      "error_message" in output ? output.error_message : undefined

    if (requireAi && useAiGeneration && output.questions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AI_GENERATION_REQUIRED",
            message: errorMessage ?? "AI question generation was required but failed.",
          },
        },
        { status: 502 }
      )
    }

    const attemptId = body.attempt_id ?? body.attemptId
    const interviewId = body.interview_id ?? body.interviewId
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
