import {
  type BaseGenerationInput,
  type InterviewQuestion,
  generateQuestions as generateRoleAwareQuestionSet,
} from "@/lib/server/ai/interview-flow"
import { classifySkillType, bucketSkill, presentSkillName } from "@/lib/server/ai/skills"

export async function generateInterviewQuestions(
  input: BaseGenerationInput
): Promise<InterviewQuestion[]> {
  const generated = await generateRoleAwareQuestionSet(input)

  return generated.map((question, index) => {
    const displaySkill = presentSkillName(question.skill)
    const skillType = classifySkillType(displaySkill)

    return {
      id: question.id || `q-${index}`,
      question: question.question,
      skill: displaySkill,
      skill_type: skillType,
      skill_bucket: bucketSkill(displaySkill),
      source_type: "adaptive",
      reference_context: {
        anchor: displaySkill,
        source: "adaptive",
      },
      is_dynamic: true,
      allow_followups: true,
      question_type: skillType === "behavioral" ? "behavioral" : "open_ended",
    }
  })
}

export type { BaseGenerationInput, InterviewQuestion } from "@/lib/server/ai/interview-flow"
