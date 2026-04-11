import { enforceBehavioralQuestions, Question, RoleType } from "@/lib/server/ai/behavioral"

export type GenerateQuestionsInput = {
  roleType: RoleType
  totalQuestions: number
  skillTags: string[]
  baseQuestions: Question[]
  behavioralBank: Question[]
  jobTitle?: string
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

const DEFAULT_SKILLS = ["system design", "troubleshooting", "database", "api", "security"]

const GENERIC_PATTERNS = [
  /tell me about a challenge/i,
  /biggest challenge/i,
  /your strengths/i,
  /your weaknesses/i,
  /why should we hire/i,
  /why this role/i,
  /why this job/i,
  /describe yourself/i,
  /what motivates you/i,
  /what are you looking for/i,
]

const SCENARIO_KEYWORDS = [
  "production",
  "incident",
  "outage",
  "latency",
  "slow",
  "error",
  "failure",
  "deploy",
  "deployment",
  "rollback",
  "scale",
  "traffic",
  "bug",
  "debug",
  "performance",
  "audit",
  "security",
  "customer",
  "user",
  "compliance",
  "migration",
  "data loss",
]

const QUESTION_STARTERS = [
  "How do you handle",
  "What would you check if",
  "Can you walk me through",
]

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

function containsJobTitle(text: string, jobTitle?: string) {
  if (!jobTitle) {
    return false
  }

  const normalizedTitle = normalizeText(jobTitle)
  if (!normalizedTitle) {
    return false
  }

  const normalizedText = normalizeText(text)
  return normalizedText.includes(normalizedTitle)
}

function containsSkillTag(text: string, skillTags: string[]) {
  const normalizedText = normalizeText(text)
  const normalizedSkills = skillTags
    .map((skill) => normalizeText(skill))
    .filter((skill) => skill.length >= 3)

  return normalizedSkills.some((skill) => normalizedText.includes(skill))
}

function containsScenario(text: string) {
  const normalizedText = normalizeText(text)
  return SCENARIO_KEYWORDS.some((keyword) => normalizedText.includes(keyword))
}

function isGenericOrVague(text: string) {
  return GENERIC_PATTERNS.some((pattern) => pattern.test(text))
}

function hasPreferredStarter(text: string) {
  return QUESTION_STARTERS.some((starter) => text.startsWith(starter))
}

function validateQuestionText(text: string, jobTitle: string | undefined, skillTags: string[]) {
  if (!text || text.trim().length < 12) {
    return false
  }

  if (containsJobTitle(text, jobTitle)) {
    return false
  }

  if (!containsSkillTag(text, skillTags)) {
    return false
  }

  if (!containsScenario(text)) {
    return false
  }

  if (isGenericOrVague(text)) {
    return false
  }

  return true
}

function sanitizeQuestions(questions: Question[], jobTitle: string | undefined, skillTags: string[]) {
  return questions.filter((question) => validateQuestionText(question.text, jobTitle, skillTags))
}

function createFallbackQuestion(skill: string, index: number): Question {
  const templates = [
    `How do you handle a production incident involving ${skill}?`,
    `What would you check if ${skill} started failing during a deployment?`,
    `Can you walk me through diagnosing a performance issue related to ${skill}?`,
  ]

  const text = templates[index % templates.length]

  return {
    id: `fallback-${skill}-${index}`,
    text,
    phase: "MID",
    tags: [skill],
    type: "TECHNICAL",
  }
}

function buildFallbackQuestions(skillTags: string[], totalNeeded: number) {
  const skills = skillTags.length > 0 ? skillTags : DEFAULT_SKILLS
  const fallback: Question[] = []

  let index = 0
  while (fallback.length < totalNeeded) {
    const skill = skills[index % skills.length]
    const question = createFallbackQuestion(skill, index)
    fallback.push(question)
    index += 1
  }

  return fallback
}

function enforceQuestionStyle(questions: Question[]) {
  return questions.map((question) => {
    const trimmed = question.text.trim()

    if (hasPreferredStarter(trimmed)) {
      return question
    }

    return {
      ...question,
      text: `Can you walk me through ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`,
    }
  })
}

export function generateQuestions(input: GenerateQuestionsInput) {
  const skillTags = input.skillTags ?? []
  const jobTitle = input.jobTitle

  const sanitizedBase = sanitizeQuestions(input.baseQuestions ?? [], jobTitle, skillTags)
  const sanitizedBehavioral = sanitizeQuestions(input.behavioralBank ?? [], jobTitle, skillTags)

  const combinedBase = sanitizedBase.slice(0, input.totalQuestions)
  const needed = Math.max(0, input.totalQuestions - combinedBase.length)
  const fallback = needed > 0 ? buildFallbackQuestions(skillTags, needed) : []

  const curatedBase = enforceQuestionStyle([...combinedBase, ...fallback])

  return enforceBehavioralQuestions({
    roleType: input.roleType,
    baseQuestions: curatedBase,
    behavioralBank: sanitizedBehavioral,
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
