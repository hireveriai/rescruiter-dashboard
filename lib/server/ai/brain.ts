import { enforceBehavioralQuestions, Question, RoleType } from "@/lib/server/ai/behavioral"
import { assignSkillsToQuestions, buildSkillUniverse, classifySkillType, presentSkillName } from "@/lib/server/ai/skills"
import {
  classifyInterviewQuestion,
  InterviewQuestionType,
} from "@/lib/server/ai/interview-question-types"

export type GenerateQuestionsInput = {
  roleType: RoleType
  totalQuestions: number
  skillTags: string[]
  baseQuestions: Question[]
  behavioralBank: Question[]
  jobTitle?: string
  previousQuestions?: string[]
  similarityThreshold?: number
  includeAttemptHistory?: boolean
  jobDescription?: string
  coreSkills?: string[]
  resumeSkills?: string[]
  skillsRemaining?: string[]
}

export type EvaluateAnswerInput = {
  questionId: string
  question?: string
  questionType?: string
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

export type QuestionQualityInput = {
  question: string
  jobTitle?: string
  jobSkills: string[]
  previousQuestions: string[]
  similarityThreshold?: number
}

export type QuestionQualityResult = {
  status: "accepted" | "rejected"
  reason: string
  score: {
    clarity: number
    relevance: number
    specificity: number
    average: number
  }
}

export type RegenerationReason =
  | "job_title_used"
  | "generic_question"
  | "no_skill_reference"
  | "repetition"
  | "grammar_issue"
  | "no_scenario"
  | "too_short"
  | "low_quality"

export type RegenerationAttempt = {
  attempt: number
  question: string
  status: "accepted" | "rejected"
  reason: RegenerationReason | "ok"
}

export type RegenerationResult = {
  question: Question
  status: "accepted" | "rejected"
  reason: RegenerationReason | "ok"
  attempts: number
  history?: RegenerationAttempt[]
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
  /describe a situation/i,
  /tell me about a time/i,
]

const LOCATION_TERMS = [
  "delhi",
  "bangalore",
  "bengaluru",
  "mumbai",
  "pune",
  "hyderabad",
  "remote",
  "onsite",
  "on-site",
  "office",
  "us",
  "usa",
  "india",
  "uk",
  "london",
  "nyc",
  "new york",
  "sf",
  "san francisco",
]

const RESUME_LEAK_PATTERNS = [
  /\byou highlighted\b/i,
  /\byour background includes\b/i,
  /\bworked as\b/i,
  /\bawarded as\b/i,
  /\bemployee of the month\b/i,
  /\bfrom .* to\b/i,
  /\b(19|20)\d{2}\b/,
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
  "schedule",
  "scheduling",
  "resource",
  "allocation",
  "capacity",
  "sla",
  "service level",
  "reschedule",
  "customer urgency",
  "customer escalation",
  "field agent",
  "parts",
  "supply chain",
  "missed visit",
  "part shortage",
  "service delay",
  "lead conversion",
  "pipeline slippage",
  "renewal risk",
  "customer churn",
  "candidate drop-off",
  "hiring bottleneck",
  "budget variance",
  "forecast miss",
  "invoice dispute",
  "vendor delay",
  "campaign performance",
  "lead quality",
]

const TECHNICAL_SCENARIO_KEYWORDS = [
  "production incident",
  "latency spike",
  "deployment issue",
  "service outage",
  "security review",
  "performance regression",
]

const NON_TECHNICAL_SCENARIO_KEYWORDS = [
  "priorities suddenly competing for the same time window",
  "a customer commitment becoming hard to meet",
  "a schedule slipping after an unexpected change",
  "resource availability changing at the last minute",
  "multiple teams needing alignment before work can continue",
  "service pressure increasing while expectations stay high",
]

const BEHAVIORAL_SCENARIO_KEYWORDS = [
  "stakeholders pulling in different directions",
  "a difficult customer or team situation",
  "a high-pressure day where calm judgment mattered",
  "conflicting priorities forcing a tough decision",
]

const QUESTION_STARTERS = [
  "How do you handle",
  "What would you check if",
  "Can you walk me through",
]

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "to",
  "of",
  "in",
  "for",
  "on",
  "at",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "this",
  "that",
  "these",
  "those",
  "it",
  "as",
  "by",
  "from",
  "if",
  "when",
  "then",
  "you",
  "your",
  "we",
  "our",
  "us",
])

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

function prioritizeRemainingSkills(skills: string[], remaining: string[] | undefined) {
  if (!remaining || remaining.length === 0) {
    return skills
  }

  const normalizedRemaining = remaining.map((skill) => normalizeText(skill))
  const prioritized = [...skills].sort((a, b) => {
    const aPriority = normalizedRemaining.includes(normalizeText(a)) ? 1 : 0
    const bPriority = normalizedRemaining.includes(normalizeText(b)) ? 1 : 0
    return bPriority - aPriority
  })

  return prioritized
}

function filterQuestionsByRemaining(questions: Question[], remaining: string[] | undefined) {
  if (!remaining || remaining.length === 0) {
    return questions
  }

  const filtered = questions.filter((question) => containsSkillTag(question.text, remaining))
  return filtered.length > 0 ? filtered : questions
}

function tokenize(text: string) {
  return normalizeText(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
}

function similarityScore(a: string, b: string) {
  const aTokens = new Set(tokenize(a))
  const bTokens = new Set(tokenize(b))

  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0
  }

  let intersection = 0
  aTokens.forEach((token) => {
    if (bTokens.has(token)) {
      intersection += 1
    }
  })

  const union = aTokens.size + bTokens.size - intersection
  return union === 0 ? 0 : intersection / union
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

function containsLocation(text: string) {
  const normalizedText = normalizeText(text)
  return LOCATION_TERMS.some((term) => normalizedText.includes(term))
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

function getScenarioPoolForSkill(skill: string) {
  const skillType = classifySkillType(skill)
  if (skillType === "behavioral") {
    return BEHAVIORAL_SCENARIO_KEYWORDS
  }

  if (skillType === "technical") {
    return TECHNICAL_SCENARIO_KEYWORDS
  }

  return NON_TECHNICAL_SCENARIO_KEYWORDS
}

function getQuestionTypeForSkill(skill: string): Question["type"] {
  return classifySkillType(skill) === "behavioral" ? "BEHAVIORAL" : "TECHNICAL"
}

function looksLikeResumeLeak(text: string) {
  if (text.includes(" · ")) {
    return true
  }

  return RESUME_LEAK_PATTERNS.some((pattern) => pattern.test(text))
}

function isGenericOrVague(text: string) {
  return GENERIC_PATTERNS.some((pattern) => pattern.test(text))
}

function hasPreferredStarter(text: string) {
  return QUESTION_STARTERS.some((starter) => text.startsWith(starter))
}

function looksGrammatical(text: string) {
  const trimmed = text.trim()
  if (!trimmed.endsWith("?")) {
    return false
  }

  if (!/^[A-Z]/.test(trimmed)) {
    return false
  }

  if (/\?{2,}|!{2,}/.test(trimmed)) {
    return false
  }

  if (trimmed.split(" ").length < 6) {
    return false
  }

  return true
}

function scoreQuestion(text: string, skillTags: string[]) {
  const lengthScore = Math.min(5, Math.max(1, Math.floor(text.trim().length / 30)))
  const relevanceScore = containsSkillTag(text, skillTags) ? 5 : 2
  const specificityScore = containsScenario(text) ? 5 : 2
  const average = Number(((lengthScore + relevanceScore + specificityScore) / 3).toFixed(2))

  return {
    clarity: lengthScore,
    relevance: relevanceScore,
    specificity: specificityScore,
    average,
  }
}

function mapRejectionReason(reason: string): RegenerationReason {
  if (reason.includes("job title")) {
    return "job_title_used"
  }
  if (reason.includes("generic")) {
    return "generic_question"
  }
  if (reason.includes("missing job skill")) {
    return "no_skill_reference"
  }
  if (reason.includes("too similar")) {
    return "repetition"
  }
  if (reason.includes("grammar") || reason.includes("structure")) {
    return "grammar_issue"
  }
  if (reason.includes("scenario")) {
    return "no_scenario"
  }
  if (reason.includes("short")) {
    return "too_short"
  }
  if (reason.includes("low quality")) {
    return "low_quality"
  }
  return "low_quality"
}

export function validateQuestionQuality(input: QuestionQualityInput): QuestionQualityResult {
  const { question, jobTitle, jobSkills, previousQuestions } = input
  const trimmed = question.trim()

  if (containsJobTitle(trimmed, jobTitle)) {
    return { status: "rejected", reason: "contains job title", score: scoreQuestion(trimmed, jobSkills) }
  }

  if (containsLocation(trimmed)) {
    return { status: "rejected", reason: "contains location", score: scoreQuestion(trimmed, jobSkills) }
  }

  if (isGenericOrVague(trimmed)) {
    return { status: "rejected", reason: "generic or vague", score: scoreQuestion(trimmed, jobSkills) }
  }

  if (looksLikeResumeLeak(trimmed)) {
    return { status: "rejected", reason: "resume text leaked into question", score: scoreQuestion(trimmed, jobSkills) }
  }

  if (!containsSkillTag(trimmed, jobSkills)) {
    return { status: "rejected", reason: "missing job skill", score: scoreQuestion(trimmed, jobSkills) }
  }

  if (!containsScenario(trimmed)) {
    return { status: "rejected", reason: "missing real-world scenario", score: scoreQuestion(trimmed, jobSkills) }
  }

  if (!looksGrammatical(trimmed)) {
    return { status: "rejected", reason: "grammar or structure issues", score: scoreQuestion(trimmed, jobSkills) }
  }

  const similarityThreshold = typeof input.similarityThreshold === "number" ? input.similarityThreshold : 0.8
  for (const prev of previousQuestions) {
    if (similarityScore(trimmed, prev) >= similarityThreshold) {
      return { status: "rejected", reason: "too similar to previous question", score: scoreQuestion(trimmed, jobSkills) }
    }
  }

  const score = scoreQuestion(trimmed, jobSkills)
  if (score.average < 3) {
    return { status: "rejected", reason: "low quality score", score }
  }

  return { status: "accepted", reason: "ok", score }
}

function sanitizeQuestions(questions: Question[], jobTitle: string | undefined, skillTags: string[]) {
  return questions.filter((question) => validateQuestionText(question.text, jobTitle, skillTags))
}

function validateQuestionText(text: string, jobTitle: string | undefined, skillTags: string[]) {
  if (!text || text.trim().length < 18) {
    return false
  }

  if (containsJobTitle(text, jobTitle)) {
    return false
  }

  if (containsLocation(text)) {
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

  if (!looksGrammatical(text)) {
    return false
  }

  return true
}

function createFallbackQuestion(skill: string, index: number, scenario: string): Question {
  const displaySkill = presentSkillName(skill)
  const skillType = classifySkillType(skill)
  const templates = [
    skillType === "technical"
      ? `How do you investigate ${scenario} when ${displaySkill} is involved?`
      : `How do you handle ${scenario} when ${displaySkill} needs to stay on track?`,
    skillType === "technical"
      ? `Walk me through how you would respond if ${scenario} started affecting ${displaySkill}.`
      : `Walk me through how you would respond if ${scenario} started affecting ${displaySkill}.`,
    skillType === "technical"
      ? `Tell me about a time when ${scenario} tested your judgment around ${displaySkill}.`
      : `Tell me about a time when ${scenario} created pressure around ${displaySkill}, and what you did next.`,
  ]

  const text = templates[index % templates.length]

  return {
    id: `fallback-${skill}-${index}`,
    text,
    phase: "MID",
    tags: [skill],
    type: getQuestionTypeForSkill(skill),
  }
}

function buildFallbackQuestions(skillTags: string[], totalNeeded: number) {
  const skills = skillTags.length > 0 ? skillTags : DEFAULT_SKILLS
  const fallback: Question[] = []

  let index = 0
  while (fallback.length < totalNeeded) {
    const skill = skills[index % skills.length]
    const scenarioPool = getScenarioPoolForSkill(skill)
    const scenario = scenarioPool[index % scenarioPool.length]
    const question = createFallbackQuestion(skill, index, scenario)
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

function enforceUniqueSkills(questions: Question[], skillTags: string[]) {
  const seen = new Set<string>()
  const normalizedTags = skillTags.map((skill) => normalizeText(skill))
  const output: Question[] = []

  questions.forEach((question, index) => {
    const skill = question.tags?.[0] ?? ""
    const normalizedSkill = normalizeText(skill)
    if (!normalizedSkill || seen.has(normalizedSkill)) {
      const available = normalizedTags.filter((tag) => !seen.has(tag))
      if (available.length === 0) {
        return
      }

      const replacementSkill = available[index % available.length]
      output.push({
        ...question,
        text: `How do you handle pressure on ${replacementSkill} when priorities start competing?`,
        tags: [replacementSkill],
      })
      seen.add(replacementSkill)
      return
    }

    seen.add(normalizedSkill)
    output.push(question)
  })

  return output
}

function buildRegeneratedQuestion(params: {
  reason: RegenerationReason
  skill: string
  scenario: string
  attempt: number
}): Question {
  const { reason, skill, scenario, attempt } = params
  const displaySkill = presentSkillName(skill)
  const skillType = classifySkillType(skill)
  const baseTemplates = [
    skillType === "technical"
      ? `How do you investigate ${scenario} when ${displaySkill} is central to the outcome?`
      : `How do you handle ${scenario} when ${displaySkill} is central to the outcome?`,
    `Walk me through how you would respond if ${scenario} started affecting ${displaySkill}.`,
    `Tell me about a time when ${scenario} created pressure around ${displaySkill}.`,
  ]

  if (reason === "generic_question") {
      return {
        id: `regen-${skill}-${attempt}`,
      text: `Tell me about a time when ${scenario} made ${displaySkill} harder to manage, and how you handled it.`,
        phase: "MID",
        tags: [skill],
        type: getQuestionTypeForSkill(skill),
    }
  }

  if (reason === "no_skill_reference") {
      return {
        id: `regen-${skill}-${attempt}`,
      text:
        skillType === "technical"
          ? `How do you investigate ${scenario} when ${displaySkill} is a key part of the work?`
          : `How do you handle ${scenario} when ${displaySkill} is a key part of the work?`,
        phase: "MID",
        tags: [skill],
        type: getQuestionTypeForSkill(skill),
    }
  }

  if (reason === "repetition") {
      return {
        id: `regen-${skill}-${attempt}`,
      text: `Walk me through a different example where ${scenario} tested your handling of ${displaySkill}.`,
        phase: "MID",
        tags: [skill],
        type: getQuestionTypeForSkill(skill),
    }
  }

  if (reason === "grammar_issue") {
      return {
        id: `regen-${skill}-${attempt}`,
      text: `Walk me through how you would respond if ${scenario} started affecting ${displaySkill}.`,
        phase: "MID",
        tags: [skill],
        type: getQuestionTypeForSkill(skill),
    }
  }

  if (reason === "job_title_used") {
      return {
        id: `regen-${skill}-${attempt}`,
      text: `Tell me about a situation where ${scenario} required strong judgment in ${displaySkill}.`,
        phase: "MID",
        tags: [skill],
        type: getQuestionTypeForSkill(skill),
    }
  }

  return {
    id: `regen-${skill}-${attempt}`,
    text: baseTemplates[attempt % baseTemplates.length],
    phase: "MID",
    tags: [skill],
    type: getQuestionTypeForSkill(skill),
  }
}

function regenerateQuestionWithFeedback(params: {
  original: Question
  reason: RegenerationReason
  skillTags: string[]
  previousQuestions: string[]
  attempt: number
}): Question {
  const { reason, skillTags, previousQuestions, attempt } = params
  const skillPool = skillTags.length > 0 ? skillTags : DEFAULT_SKILLS

  let skill = skillPool[attempt % skillPool.length]
  if (reason === "repetition" && skillPool.length > 1) {
    skill = skillPool[(attempt + 1) % skillPool.length]
  }

  const scenarioPool = getScenarioPoolForSkill(skill)
  const scenario = scenarioPool[(attempt + previousQuestions.length) % scenarioPool.length]

  return buildRegeneratedQuestion({ reason, skill, scenario, attempt })
}

export function regenerateQuestionWithValidation(params: {
  question: Question
  jobTitle: string | undefined
  jobSkills: string[]
  previousQuestions: string[]
  similarityThreshold?: number
  includeAttemptHistory?: boolean
}): RegenerationResult {
  const { question, jobTitle, jobSkills, previousQuestions, similarityThreshold, includeAttemptHistory } = params
  let attempt = 0
  let candidate = question
  let lastReason: RegenerationReason | "ok" = "ok"
  const history: RegenerationAttempt[] = []

  while (attempt < 3) {
    const quality = validateQuestionQuality({
      question: candidate.text,
      jobTitle,
      jobSkills,
      previousQuestions,
      similarityThreshold,
    })

    if (quality.status === "accepted") {
      history.push({
        attempt: attempt + 1,
        question: candidate.text,
        status: "accepted",
        reason: "ok",
      })

      return {
        question: candidate,
        status: "accepted",
        reason: "ok",
        attempts: attempt + 1,
        history: includeAttemptHistory ? history : undefined,
      }
    }

    lastReason = mapRejectionReason(quality.reason)
    history.push({
      attempt: attempt + 1,
      question: candidate.text,
      status: "rejected",
      reason: lastReason,
    })

    candidate = regenerateQuestionWithFeedback({
      original: question,
      reason: lastReason,
      skillTags: jobSkills,
      previousQuestions,
      attempt,
    })
    attempt += 1
  }

  const fallbackSkill = jobSkills[0] ?? DEFAULT_SKILLS[0]
  const fallback = createFallbackQuestion(fallbackSkill, attempt, SCENARIO_KEYWORDS[attempt % SCENARIO_KEYWORDS.length])

  return {
    question: fallback,
    status: "rejected",
    reason: lastReason,
    attempts: attempt,
    history: includeAttemptHistory ? history : undefined,
  }
}

function filterAndRegenerateQuestions(params: {
  questions: Question[]
  jobTitle: string | undefined
  skillTags: string[]
  previousQuestions: string[]
  similarityThreshold?: number
}): Question[] {
  const { questions, jobTitle, skillTags, previousQuestions, similarityThreshold } = params
  const accepted: Question[] = []
  const prev = [...previousQuestions]

  questions.forEach((question) => {
    const regeneration = regenerateQuestionWithValidation({
      question,
      jobTitle,
      jobSkills: skillTags,
      previousQuestions: prev,
      similarityThreshold,
    })

    accepted.push(regeneration.question)
    prev.push(regeneration.question.text)
  })

  return accepted
}

export function generateQuestions(input: GenerateQuestionsInput) {
  const derivedSkills = buildSkillUniverse({
    jobDescription: input.jobDescription,
    coreSkills: input.coreSkills,
    resumeSkills: input.resumeSkills,
  })

  const skillTags = input.skillTags?.length ? input.skillTags : derivedSkills
  const prioritizedSkills = prioritizeRemainingSkills(skillTags, input.skillsRemaining)
  const jobTitle = input.jobTitle
  const previousQuestions = input.previousQuestions ?? []

  const baseQuestions = filterQuestionsByRemaining(input.baseQuestions ?? [], input.skillsRemaining)
  const behavioralQuestions = filterQuestionsByRemaining(input.behavioralBank ?? [], input.skillsRemaining)

  const sanitizedBase = sanitizeQuestions(baseQuestions, jobTitle, prioritizedSkills)
  const sanitizedBehavioral = sanitizeQuestions(behavioralQuestions, jobTitle, prioritizedSkills)

  const combinedBase = sanitizedBase.slice(0, input.totalQuestions)

  const curatedBase = filterAndRegenerateQuestions({
    questions: combinedBase,
    jobTitle,
    skillTags: prioritizedSkills,
    previousQuestions,
    similarityThreshold: input.similarityThreshold,
  })

  const needed = Math.max(0, input.totalQuestions - curatedBase.length)
  const fallback = needed > 0 ? buildFallbackQuestions(prioritizedSkills, needed) : []

  const finalBase = enforceQuestionStyle([...curatedBase, ...fallback])
  const withSkills = assignSkillsToQuestions(finalBase, prioritizedSkills)
  const uniqueSkills = enforceUniqueSkills(withSkills, prioritizedSkills)
  const behavioralWithSkills = assignSkillsToQuestions(sanitizedBehavioral, prioritizedSkills)

  return enforceBehavioralQuestions({
    roleType: input.roleType,
    baseQuestions: uniqueSkills,
    behavioralBank: behavioralWithSkills,
  })
}

function rubricSignals(questionType: InterviewQuestionType) {
  switch (questionType) {
    case InterviewQuestionType.CODING:
      return ["correctness", "optimization", "syntax", "complexity", "execution"]
    case InterviewQuestionType.SYSTEM_DESIGN:
      return ["scalability", "tradeoffs", "resilience", "architecture_maturity"]
    case InterviewQuestionType.BEHAVIORAL:
      return ["communication", "ownership", "emotional_maturity", "leadership"]
    case InterviewQuestionType.ARCHITECTURE:
      return ["strategy", "governance", "enterprise_integration", "risk"]
    case InterviewQuestionType.TROUBLESHOOTING:
      return ["debugging_methodology", "rca_quality", "prioritization", "operational_maturity"]
    case InterviewQuestionType.CASE_STUDY:
      return ["scenario_analysis", "structure", "tradeoffs", "decision_quality"]
    case InterviewQuestionType.MCQ:
      return ["objective_accuracy", "explanation_quality"]
    case InterviewQuestionType.TECHNICAL_DISCUSSION:
    default:
      return ["technical_depth", "real_world_experience", "terminology", "measurable_outcomes", "clarity"]
  }
}

export function evaluateAnswer(input: EvaluateAnswerInput): EvaluateAnswerResult {
  const classified = classifyInterviewQuestion(
    input.question ?? input.questionId,
    input.roleType,
    input.skillTags
  )
  const questionType =
    input.questionType && Object.values(InterviewQuestionType).includes(input.questionType as InterviewQuestionType)
      ? (input.questionType as InterviewQuestionType)
      : classified.questionType
  const wordCount = input.answer.trim().split(/\s+/).filter(Boolean).length
  const hasSpecifics =
    /\b\d+(\.\d+)?%?\b|\b(production|migration|latency|cost|scale|users|requests|sla|rollback|index|cache|queue|incident)\b/i.test(
      input.answer
    )
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round((wordCount >= 40 ? 55 : 35) + (hasSpecifics ? 25 : 0) + classified.confidence * 20)
    )
  )

  return {
    score,
    rationale: `Evaluated as ${questionType}; scoring rubric is type-specific and does not assume coding unless executable output was requested.`,
    signals: rubricSignals(questionType),
  }
}

export function selectNextQuestion(input: NextQuestionInput): NextQuestionResult {
  const next = input.remainingQuestions[0] ?? null
  return { nextQuestion: next }
}
