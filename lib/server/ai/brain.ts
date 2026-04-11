import { enforceBehavioralQuestions, Question, RoleType } from "@/lib/server/ai/behavioral"

export type GenerateQuestionsInput = {
  roleType: RoleType
  totalQuestions: number
  skillTags: string[]
  baseQuestions: Question[]
  behavioralBank: Question[]
}

export type EvaluateAnswerInput = {
  questionId: string
  answer: string
  roleType: RoleType
  skillTags: string[]
}

export type EvaluateAnswerResult = {
  score: number
  rationale: string
  signals: string[]
}

export type NextQuestionInput = {
  roleType: RoleType
  remainingQuestions: Question[]
  lastEvaluation?: EvaluateAnswerResult
}

export type NextQuestionResult = {
  nextQuestion: Question | null
}

export function generateQuestions(input: GenerateQuestionsInput) {
  const base = input.baseQuestions.slice(0, input.totalQuestions)
  return enforceBehavioralQuestions({
    roleType: input.roleType,
    baseQuestions: base,
    behavioralBank: input.behavioralBank,
  })
}

export function evaluateAnswer(_input: EvaluateAnswerInput): EvaluateAnswerResult {
  return {
    score: 0,
    rationale: "Evaluation pipeline not wired yet",
    signals: [],
  }
}

export function selectNextQuestion(input: NextQuestionInput): NextQuestionResult {
  const next = input.remainingQuestions[0] ?? null
  return { nextQuestion: next }
}
