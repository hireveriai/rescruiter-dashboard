import {
  type BaseGenerationInput,
  type InterviewQuestion,
  generateQuestions as generateRoleAwareQuestionSet,
} from "@/lib/server/ai/interview-flow"
import { validateQuestionStrict } from "@/lib/question-validator"
import {
  classifySkillType,
  bucketSkill,
  deriveSkillsFromText,
  normalizeSkillName,
  presentSkillName,
  sanitizeSkillList,
} from "@/lib/server/ai/skills"

function buildResumeQuestion(skill: string, index: number) {
  const displaySkill = presentSkillName(skill)
  const templates = [
    `How have you used ${displaySkill} in recent projects to improve outcomes?`,
    `Walk me through a recent project where you applied ${displaySkill} directly.`,
    `What would you improve next time when using ${displaySkill} in production work?`,
  ]

  return templates[index % templates.length]
}

function mapQuestion(
  question: {
    id: string
    question: string
    skill: string
    source_type?: "resume" | "job" | "behavioral" | "adaptive"
  },
  index: number
): InterviewQuestion {
  const displaySkill = presentSkillName(question.skill)
  const skillType = classifySkillType(displaySkill)
  const questionId = question.id || `q-${index}`
  const sourceType = question.source_type === "resume" ? "resume" : question.source_type === "behavioral" ? "behavioral" : "job"

  return {
    id: questionId,
    question: question.question,
    skill: displaySkill,
    skill_type: skillType,
    skill_bucket: bucketSkill(displaySkill),
    source_type: sourceType,
    reference_context: {
      anchor: `${displaySkill}:${questionId}`,
      source: sourceType,
    },
    is_dynamic: true,
    allow_followups: true,
    question_type: skillType === "behavioral" ? "behavioral" : "open_ended",
  }
}

export async function generateInterviewQuestions(
  input: BaseGenerationInput
): Promise<InterviewQuestion[]> {
  const generated = await generateRoleAwareQuestionSet(input)
  const totalQuestions = Math.max(5, Math.min(10, Number(input.totalQuestions ?? generated.length ?? 7) || 7))
  const targetResumeCount = Math.min(
    2,
    Math.max(1, Math.round(totalQuestions * 0.3)),
  )
  const jobSkills = Array.from(new Set([
    ...sanitizeSkillList(input.coreSkills ?? [], {
      jobTitle: input.jobTitle,
      jobDescription: input.jobDescription,
    }),
    ...deriveSkillsFromText(input.jobDescription),
  ])).map(normalizeSkillName)
  const resumeSkills = Array.from(new Set([
    ...sanitizeSkillList(input.candidateResumeSkills ?? [], {
      jobTitle: input.jobTitle,
      jobDescription: input.jobDescription,
    }),
    ...deriveSkillsFromText(input.candidateResumeText),
  ])).map(normalizeSkillName)
  const resumeOnlySkills = resumeSkills.filter((skill) => !jobSkills.includes(skill))
  const selectedResumeSkills = (resumeOnlySkills.length > 0 ? resumeOnlySkills : resumeSkills)
    .slice(0, targetResumeCount)

  const generatedQuestions = generated.map((question, index) => mapQuestion(question, index))
  const keptJobQuestions = generatedQuestions
    .filter((question) => question.source_type !== "resume")
    .slice(0, Math.max(0, totalQuestions - selectedResumeSkills.length))

  const injectedResumeQuestions = selectedResumeSkills.map((skill, index) => {
    const questionText = buildResumeQuestion(skill, index)
    const safeQuestion = validateQuestionStrict(questionText).valid
      ? questionText
      : `How have you used ${presentSkillName(skill)} in recent projects at work?`

    return mapQuestion(
      {
        id: `resume-${index}`,
        question: safeQuestion,
        skill,
        source_type: "resume",
      },
      keptJobQuestions.length + index
    )
  })

  return [...keptJobQuestions, ...injectedResumeQuestions].slice(0, totalQuestions)
}

export type { BaseGenerationInput, InterviewQuestion } from "@/lib/server/ai/interview-flow"
