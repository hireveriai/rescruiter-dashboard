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

function resolveSeniorityLevel(level?: string) {
  const normalized = String(level ?? "").toLowerCase().trim()
  if (/senior|lead|staff|principal|manager|head|director/.test(normalized)) {
    return "senior"
  }
  if (/mid|intermediate|3|4|5/.test(normalized)) {
    return "mid"
  }
  return "junior"
}

function buildResumeQuestion(skill: string, index: number, seniorityLevel: "junior" | "mid" | "senior") {
  const displaySkill = presentSkillName(skill)
  const templatesByLevel = {
    junior: [
      `How have you used ${displaySkill} in recent projects to solve routine problems?`,
      `Walk me through a recent task where you applied ${displaySkill} directly.`,
      `What would you check first when using ${displaySkill} under time pressure?`,
    ],
    mid: [
      `How have you used ${displaySkill} under delivery pressure in recent projects?`,
      `Walk me through using ${displaySkill} when priorities changed during execution.`,
      `What trade-offs matter when applying ${displaySkill} under moderate constraints?`,
    ],
    senior: [
      `How do you keep ${displaySkill} reliable under peak pressure and changing constraints?`,
      `Walk me through leading ${displaySkill} decisions under ambiguity and scale.`,
      `How do you design around ${displaySkill} when failures threaten critical outcomes?`,
    ],
  } as const
  const templates = templatesByLevel[seniorityLevel]

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
  const seniorityLevel = resolveSeniorityLevel(input.experienceLevel)
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
    const questionText = buildResumeQuestion(skill, index, seniorityLevel)
    const safeQuestion = validateQuestionStrict(questionText).valid
      ? questionText
      : seniorityLevel === "senior"
        ? `How do you design ${presentSkillName(skill)} for resilience under pressure?`
        : seniorityLevel === "mid"
          ? `How have you used ${presentSkillName(skill)} under delivery pressure at work?`
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
