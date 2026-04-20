import { Question } from "@/lib/server/ai/behavioral"
import { regenerateQuestionWithValidation, validateQuestionQuality } from "@/lib/server/ai/brain"
import {
  assignSkillsToQuestions,
  buildSkillUniverse,
  bucketSkill,
  classifySkillType,
  computeSkillCoverage,
  getFallbackSkillsForRoleFamily,
  inferRoleIntelligence,
  mapQuestionToSkill,
  normalizeSkillName,
  presentSkillName,
  sanitizeSkillList,
  RoleIntelligence,
  scoreAnswerForSkill,
} from "@/lib/server/ai/skills"

export type BaseGenerationInput = {
  jobDescription?: string
  coreSkills?: string[]
  candidateResumeText?: string
  candidateResumeSkills?: string[]
  experienceLevel?: string
  totalQuestions?: number
  interviewDurationMinutes?: number
  jobTitle?: string
  previousQuestions?: string[]
  similarityThreshold?: number
}

export type InterviewQuestion = {
  id: string
  question: string
  skill: string
  skill_type: "technical" | "functional" | "behavioral"
  skill_bucket?: string
}

type EnrichedGeneratedQuestion = Question & {
  skill?: string
  skillBucket?: string
}

export type BaseGenerationOutput = {
  questions: InterviewQuestion[]
  skills_covered: string[]
  skills_remaining: string[]
  meta?: {
    role_family: string
    role_subfamily?: string
    role_confidence: number
    adaptive_mode: boolean
    question_mode: string
  }
}

export type BaseGenerationOutputWithError = BaseGenerationOutput & {
  error_message?: string
}

export type NextQuestionInput = {
  lastAnswer?: string
  skillScore?: number
  fraudScore?: number
  skillsRemaining: string[]
  timeRemainingSeconds?: number
  followupCount?: number
  lastQuestion?: InterviewQuestion
  criticalSkills?: string[]
  experienceLevel?: string
  responseAnalysis?: ResponseAnalysis
  roleConfidence?: number
  adaptiveMode?: boolean
  questionMode?: string
  askedQuestions?: string[]
}

export type NextQuestionDecision = {
  intent: "followup" | "next_skill" | "contradiction" | "exploratory"
  nextSkill?: string
  followUp?: FollowUpResult
  difficulty?: "guided" | "scenario" | "strategic"
  updatedEvaluation?: ResponseAnalysis
}

export type FollowUpInput = {
  lastQuestion: InterviewQuestion
  candidateAnswer: string
  skillScore?: number
  fraudScore?: number
}

export type FollowUpResult = {
  follow_up_question: string
  intent: "clarification" | "probe" | "contradiction" | "exploratory" | "simplification" | "difficulty_up"
}

export type ResponseAnalysis = {
  clarity_score: number
  confidence_score: number
  depth_score: number
  suspicion_score: number
  skill_score: number
  role_clarity_score: number
  question_difficulty: "guided" | "scenario" | "strategic"
  signals: string[]
}

type OpenAIResponsesOutputText = {
  output_text?: string
  output?: Array<{
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
}

const OPENAI_FOLLOWUP_MODEL = "gpt-4o-mini"
const OPENAI_QUESTION_MODEL = "gpt-4o-mini"

const DEFAULT_TOTAL = 7
const MIN_BASE_QUESTIONS = 5
const MAX_BASE_QUESTIONS = 10
const RESUME_RATIO = 0.3
const JOB_RATIO = 0.5
const BEHAVIORAL_RATIO = 0.2

const VAGUE_MARKERS = ["not sure", "maybe", "i think", "not certain", "somehow"]
const STRONG_MARKERS = ["always", "never", "definitely", "absolutely"]

const QUESTION_STARTERS = [
  "How do you handle",
  "What would you check if",
  "Can you walk me through",
]

const SCENARIO_KEYS = [
  "production incident",
  "latency spike",
  "deployment failure",
  "data migration",
  "security audit",
  "customer escalation",
  "system outage",
  "performance regression",
  "schedule conflict",
  "resource shortage",
  "part shortage",
  "service delay",
  "missed visit",
  "sla breach",
]

const TOOL_KEYS = [
  "monitoring dashboard",
  "query analyzer",
  "logs",
  "tracing",
  "index diagnostics",
  "backup restore",
]

const DECISION_KEYS = [
  "trade-off",
  "prioritize",
  "rollback",
  "risk mitigation",
  "capacity planning",
]

const EXPERIENCE_KEYS = [
  "recent project",
  "past incident",
  "migration",
  "optimization",
]

const AI_BAD_PREFIXES = [
  "you highlighted",
  "your background includes",
  "worked as",
  "awarded as",
  "when aug",
  "when sep",
  "when oct",
  "when nov",
  "when dec",
  "when jan",
  "when feb",
  "when mar",
  "when apr",
  "when may",
  "when jun",
  "when jul",
]

const NON_TECHNICAL_FORBIDDEN_PHRASES = ["troubleshoot", "production", "deployment", "latency", "rollback", "regression"]
const QUESTION_VARIATION_STARTERS = ["How do you", "Walk me through", "Tell me about a time when", "What signals tell you"]

type QuestionIntent =
  | "troubleshooting"
  | "optimization"
  | "execution"
  | "behavioral"
  | "prioritization"
  | "coordination"
  | "judgment"
  | "analysis"

const EXPERIENCE_CRITICAL_SKILLS = {
  technical: {
    junior: ["testing", "debugging", "api", "database", "security"],
    mid: ["performance", "security", "operations", "database", "api"],
    senior: ["architecture", "scalability", "security", "performance", "compliance"],
  },
  operations: {
    junior: ["scheduling", "service delivery", "customer urgency", "rescheduling", "coordination"],
    mid: ["resource allocation", "capacity planning", "sla management", "service delivery", "supply chain coordination"],
    senior: ["capacity planning", "resource allocation", "contract execution", "service delivery", "stakeholder management"],
  },
  sales: {
    junior: ["prospecting", "lead management", "crm management", "communication", "negotiation"],
    mid: ["sales pipeline management", "negotiation", "account management", "forecasting", "deal closing"],
    senior: ["account planning", "deal closing", "forecasting", "stakeholder management", "strategy"],
  },
  customer_success: {
    junior: ["customer onboarding", "customer support", "communication", "crm management", "customer retention"],
    mid: ["customer success management", "renewal management", "stakeholder management", "customer retention", "reporting"],
    senior: ["customer retention", "renewal management", "stakeholder management", "strategy", "service levels"],
  },
  hr: {
    junior: ["candidate sourcing", "candidate screening", "communication", "coordination", "interview management"],
    mid: ["talent acquisition", "candidate sourcing", "stakeholder management", "reporting", "employee relations"],
    senior: ["workforce planning", "talent acquisition", "employee relations", "stakeholder management", "strategy"],
  },
  finance: {
    junior: ["accounts payable", "accounts receivable", "invoice management", "accuracy", "reporting"],
    mid: ["financial reporting", "budgeting", "financial forecasting", "variance analysis", "controls"],
    senior: ["financial planning analysis", "budgeting", "forecasting", "compliance", "stakeholder management"],
  },
  procurement: {
    junior: ["vendor management", "purchase order management", "inventory management", "coordination", "accuracy"],
    mid: ["procurement management", "supplier management", "vendor management", "inventory management", "cost control"],
    senior: ["procurement management", "supplier sourcing", "vendor management", "cost control", "strategy"],
  },
  marketing: {
    junior: ["campaign management", "content strategy", "crm management", "communication", "reporting"],
    mid: ["campaign management", "demand generation", "brand management", "analytics", "seo"],
    senior: ["product positioning", "brand management", "demand generation", "strategy", "go to market"],
  },
  manufacturing_industrial: {
    junior: ["production planning", "quality control", "safety compliance", "equipment maintenance", "coordination"],
    mid: ["process improvement", "quality control", "safety compliance", "production planning", "reporting"],
    senior: ["process improvement", "capacity planning", "safety compliance", "leadership", "strategy"],
  },
  construction_site: {
    junior: ["site coordination", "timeline management", "safety compliance", "resource allocation", "communication"],
    mid: ["site coordination", "resource allocation", "contract execution", "timeline management", "risk"],
    senior: ["contract execution", "resource allocation", "safety compliance", "stakeholder management", "strategy"],
  },
  legal_compliance: {
    junior: ["policy review", "contract review", "regulatory compliance", "communication", "documentation"],
    mid: ["risk assessment", "regulatory compliance", "contract review", "policy review", "judgment"],
    senior: ["risk assessment", "governance", "regulatory compliance", "stakeholder management", "strategy"],
  },
  healthcare: {
    junior: ["patient coordination", "clinical documentation", "communication", "care quality", "compliance"],
    mid: ["care quality", "clinical documentation", "patient coordination", "compliance", "judgment"],
    senior: ["care quality", "stakeholder management", "compliance", "communication", "strategy"],
  },
  education_training: {
    junior: ["instruction delivery", "learner engagement", "assessment design", "communication", "training coordination"],
    mid: ["curriculum planning", "assessment design", "learner engagement", "reporting", "stakeholder management"],
    senior: ["curriculum planning", "strategy", "stakeholder management", "learner engagement", "leadership"],
  },
  logistics_warehouse_fleet: {
    junior: ["dispatch coordination", "inventory management", "route planning", "communication", "coordination"],
    mid: ["warehouse operations", "fleet coordination", "inventory management", "route planning", "sla management"],
    senior: ["warehouse operations", "fleet coordination", "cost control", "stakeholder management", "strategy"],
  },
  creative_design_content: {
    junior: ["content strategy", "design reasoning", "communication", "brand management", "feedback"],
    mid: ["creative strategy", "content strategy", "design reasoning", "stakeholder management", "brand management"],
    senior: ["creative strategy", "brand management", "product positioning", "stakeholder management", "strategy"],
  },
  bpo_call_center: {
    junior: ["customer support", "communication", "ticket handling", "de escalation", "sla management"],
    mid: ["customer support", "sla management", "de escalation", "reporting", "quality"],
    senior: ["stakeholder management", "service levels", "de escalation", "reporting", "leadership"],
  },
  banking_financial_services: {
    junior: ["kyc compliance", "customer advisory", "communication", "documentation", "accuracy"],
    mid: ["risk assessment", "credit evaluation", "financial reporting", "kyc compliance", "judgment"],
    senior: ["risk assessment", "stakeholder management", "compliance", "strategy", "financial reporting"],
  },
  leadership_management: {
    junior: ["team leadership", "communication", "coordination", "decision making", "ownership"],
    mid: ["team leadership", "stakeholder management", "performance management", "decision making", "planning"],
    senior: ["strategy", "team leadership", "stakeholder management", "performance management", "decision making"],
  },
  general_business: {
    junior: ["workflow", "communication", "prioritization", "coordination", "reporting"],
    mid: ["stakeholder management", "prioritization", "reporting", "planning", "decision making"],
    senior: ["strategy", "stakeholder management", "planning", "reporting", "leadership"],
  },
} as const

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

function normalizeExperienceLevel(level?: string) {
  const normalized = normalizeText(level ?? "")
  if (!normalized) {
    return "mid"
  }

  if (normalized.includes("junior") || normalized.includes("fresher") || normalized.includes("entry")) {
    return "junior"
  }

  if (normalized.includes("senior") || normalized.includes("lead") || normalized.includes("principal")) {
    return "senior"
  }

  return "mid"
}

function resolveBaseQuestionCount(input: BaseGenerationInput) {
  if (typeof input.totalQuestions === "number" && input.totalQuestions > 0) {
    return input.totalQuestions
  }

  const duration = input.interviewDurationMinutes ?? 30
  if (duration >= 60) {
    return 10
  }
  if (duration >= 45) {
    return 8
  }
  return 7
}

function prioritizeSkillsByExperience(skills: string[], input: BaseGenerationInput) {
  const level = normalizeExperienceLevel(input.experienceLevel)
  const roleIntelligence = inferRoleIntelligence({
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription,
    coreSkills: input.coreSkills,
    resumeSkills: input.candidateResumeSkills,
    resumeText: input.candidateResumeText,
  })
  const familyCritical = EXPERIENCE_CRITICAL_SKILLS[roleIntelligence.family] ?? EXPERIENCE_CRITICAL_SKILLS.general_business
  const critical = level === "junior" ? familyCritical.junior : level === "senior" ? familyCritical.senior : familyCritical.mid

  const normalizedCritical = critical.map((skill: string) => normalizeText(skill))
  return [...skills].sort((a, b) => {
    const aHit = normalizedCritical.some((crit: string) => normalizeText(presentSkillName(a)).includes(crit))
    const bHit = normalizedCritical.some((crit: string) => normalizeText(presentSkillName(b)).includes(crit))
    if (aHit === bHit) {
      return 0
    }
    return aHit ? -1 : 1
  })
}

function deriveCriticalSkills(skills: string[], input: BaseGenerationInput) {
  const ordered = prioritizeSkillsByExperience(skills, input)
  return ordered.slice(0, Math.min(5, ordered.length))
}

function shuffleWithSeed<T>(items: T[], seed: string) {
  const output = [...items]
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000
  }

  for (let i = output.length - 1; i > 0; i -= 1) {
    hash = (hash * 16807) % 2147483647
    const j = hash % (i + 1)
    const temp = output[i]
    output[i] = output[j]
    output[j] = temp
  }

  return output
}

function pickQuestionTemplate(index: number, skill: string) {
  const scenario = SCENARIO_KEYS[index % SCENARIO_KEYS.length]
  const tool = TOOL_KEYS[index % TOOL_KEYS.length]
  const decision = DECISION_KEYS[index % DECISION_KEYS.length]
  const experience = EXPERIENCE_KEYS[index % EXPERIENCE_KEYS.length]

  const templates = [
    `${QUESTION_STARTERS[0]} a ${scenario} involving ${skill}?`,
    `${QUESTION_STARTERS[1]} ${skill} caused a ${scenario} and you only had ${tool} available?`,
    `${QUESTION_STARTERS[2]} how you make a ${decision} when working with ${skill}?`,
    `${QUESTION_STARTERS[2]} a ${experience} where you improved ${skill} outcomes?`,
  ]

  return templates[index % templates.length]
}

function looksLikeResumeLine(question: string) {
  const normalized = normalizeText(question)
  if (!normalized) {
    return false
  }

  if (AI_BAD_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true
  }

  if (question.includes(" · ")) {
    return true
  }

  if (/\b(19|20)\d{2}\b/.test(question) && /(worked as|award|awarded|employee of the month|from .* to)/i.test(question)) {
    return true
  }

  return false
}

function containsForbiddenNonTechnicalPhrase(question: string) {
  const normalized = normalizeText(question)
  return NON_TECHNICAL_FORBIDDEN_PHRASES.some((phrase) => normalized.includes(phrase))
}

function cleanQuestionText(question: string) {
  return question
    .replace(/[Â·•]/g, " ")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[?!]{2,}/g, "?")
    .replace(/\s+([?.!,])/g, "$1")
    .trim()
}

function inferQuestionIntent(skill: string, skillType: ReturnType<typeof classifySkillType>, roleIntelligence?: RoleIntelligence): QuestionIntent {
  const normalizedSkill = normalizeText(skill)

  if (skillType === "behavioral") {
    return "behavioral"
  }

  if (roleIntelligence?.family === "operations" && roleIntelligence.subfamily === "field_service") {
    if (/(scheduling|schedule|dispatch|rescheduling|allocation|capacity)/.test(normalizedSkill)) {
      return "prioritization"
    }
    if (/(coordination|service delivery|field|supply chain|parts|sla)/.test(normalizedSkill)) {
      return "coordination"
    }
  }

  if (/(optimi|improv|efficien|capacity|performance)/.test(normalizedSkill)) {
    return "optimization"
  }

  if (/(troubleshoot|incident|failure|problem|issue|debug|root cause)/.test(normalizedSkill)) {
    return "troubleshooting"
  }

  if (/(schedule|dispatch|allocation|priorit|queue|timeline|deadline)/.test(normalizedSkill)) {
    return "prioritization"
  }

  if (/(coordination|stakeholder|communication|service delivery|customer|support|field)/.test(normalizedSkill)) {
    return "coordination"
  }

  if (/(risk|compliance|judgment|policy|governance|decision)/.test(normalizedSkill)) {
    return "judgment"
  }

  if (/(metric|analysis|forecast|report|data|trend|kpi)/.test(normalizedSkill)) {
    return "analysis"
  }

  return skillType === "technical" ? "troubleshooting" : "execution"
}

function buildIntentQuestion(
  displaySkill: string,
  intent: QuestionIntent,
  index: number,
  roleIntelligence?: RoleIntelligence
) {
  const starter = QUESTION_VARIATION_STARTERS[index % QUESTION_VARIATION_STARTERS.length]
  const isFieldService = roleIntelligence?.family === "operations" && roleIntelligence.subfamily === "field_service"

  const scenarioByIntent: Record<QuestionIntent, string[]> = {
    troubleshooting: isFieldService
      ? [
          `a schedule starts slipping across multiple field visits`,
          `a planned visit cannot go ahead because the required part is missing`,
          `customer urgency and engineer availability point in different directions`,
        ]
      : [
          `a workflow starts failing unexpectedly`,
          `results begin drifting off target`,
          `a key handoff breaks down under pressure`,
        ],
    optimization: isFieldService
      ? [
          `improve schedule reliability without hurting customer commitments`,
          `reduce reschedules while still protecting SLA performance`,
          `improve field planning when demand becomes unpredictable`,
        ]
      : [
          `improve consistency in ${displaySkill}`,
          `make ${displaySkill} more efficient without losing quality`,
          `improve outcomes in ${displaySkill} over time`,
        ],
    execution: [
      `delivered ${displaySkill} in a real situation`,
      `kept ${displaySkill} moving when the day changed unexpectedly`,
      `handled ${displaySkill} from plan to completion`,
    ],
    behavioral: [
      `${displaySkill} was tested under pressure`,
      `${displaySkill} became critical in a difficult situation`,
      `you had to rely on ${displaySkill} to steady a team or customer situation`,
    ],
    prioritization: isFieldService
      ? [
          `two urgent customer visits compete for the same engineer`,
          `preventive work collides with a higher-severity corrective issue`,
          `you need to rebalance schedules after a missed visit`,
        ]
      : [
          `multiple priorities compete for the same window`,
          `you have to decide what moves first when time is tight`,
          `the plan changes and not everything can be handled at once`,
        ],
    coordination: isFieldService
      ? [
          `you need to align support, field teams, and parts availability for a visit`,
          `a customer update depends on input from multiple internal teams`,
          `a planned intervention needs to be rescheduled without losing trust`,
        ]
      : [
          `different teams depend on your handling of ${displaySkill}`,
          `${displaySkill} requires alignment across multiple stakeholders`,
          `communication around ${displaySkill} starts breaking down`,
        ],
    judgment: [
      `the right decision is not obvious in ${displaySkill}`,
      `${displaySkill} involves ambiguity and risk at the same time`,
      `you have to make a call in ${displaySkill} before all facts are available`,
    ],
    analysis: [
      `you need to decide what the numbers are really saying about ${displaySkill}`,
      `metrics around ${displaySkill} point in different directions`,
      `you need to turn data from ${displaySkill} into a concrete action`,
    ],
  }

  const scenario = scenarioByIntent[intent][index % scenarioByIntent[intent].length]

  const byStarter: Record<string, string> = {
    "How do you": `${starter} handle ${scenario}?`,
    "Walk me through": `${starter} how you handled ${scenario}.`,
    "Tell me about a time when": `${starter} ${scenario}.`,
    "What signals tell you": `${starter} ${displaySkill} needs attention, and what do you do next?`,
  }

  return cleanQuestionText(byStarter[starter] ?? `${starter} handle ${scenario}?`)
}

function buildQuestionsForSkills(skills: string[], offset: number, roleIntelligence?: RoleIntelligence) {
  return skills.map((skill, idx) => {
    const skillType = classifySkillType(skill)
    const displaySkill = presentSkillName(skill)
    const intent = inferQuestionIntent(skill, skillType, roleIntelligence)
    const questionType: "BEHAVIORAL" | "TECHNICAL" =
      skillType === "behavioral" ? "BEHAVIORAL" : "TECHNICAL"

    return {
      id: `q-${offset + idx}-${skill.replace(/\s+/g, "-")}`,
      text: buildIntentQuestion(displaySkill, intent, offset + idx, roleIntelligence),
      phase: "MID" as const,
      tags: [skill],
      type: questionType,
    }
  })
}

function deriveBehavioralQuestions(count: number, skills: string[], offset: number) {
  const pool = skills.length ? skills : ["leadership", "communication"]
  const behavioral: Question[] = []

  for (let i = 0; i < count; i += 1) {
    const skill = pool[(offset + i) % pool.length]
    const displaySkill = presentSkillName(skill)
    behavioral.push({
      id: `behavioral-${offset + i}`,
      text: cleanQuestionText(buildIntentQuestion(displaySkill, "behavioral", offset + i)),
      phase: "MID",
      tags: [skill],
      type: "BEHAVIORAL",
    })
  }

  return behavioral
}

function buildAdaptiveQuestions(role: RoleIntelligence, skills: string[], offset: number) {
  const primarySkill = presentSkillName(skills[0] ?? "workflow")
  const secondarySkill = presentSkillName(skills[1] ?? skills[0] ?? "communication")

  const byMode: Record<RoleIntelligence["questionMode"], Array<(skillA: string, skillB: string) => string>> = {
    technical_problem_solving: [
      (skillA) => `When a problem lands outside the usual pattern, how do you decide what to check first in ${skillA}?`,
      (skillA, skillB) => `Which part of your work needs deeper judgment: ${skillA} or ${skillB}, and why?`,
    ],
    sales_objection_handling: [
      (skillA) => `When a prospect hesitates, how do you figure out whether the issue is timing, value, or fit in ${skillA}?`,
      (skillA, skillB) => `Which part of your sales work depends more on judgment: ${skillA} or ${skillB}, and how do you handle it?`,
    ],
    behavioral_people_judgment: [
      (skillA) => `Which part of this role depends most on people judgment, and how do you usually approach it through ${skillA}?`,
      (skillA, skillB) => `When expectations conflict, how do you decide where to focus first between ${skillA} and ${skillB}?`,
    ],
    operational_scenarios: [
      (skillA) => `When the day changes suddenly, how do you decide what to reprioritize first in ${skillA}?`,
      (skillA, skillB) => `Which part of your role is most sensitive to timing: ${skillA} or ${skillB}, and how do you keep it stable?`,
    ],
    legal_judgment: [
      (skillA) => `When the safest answer is not obvious, how do you frame the judgment call in ${skillA}?`,
      (skillA, skillB) => `Which carries more risk in your work, ${skillA} or ${skillB}, and how do you evaluate that?`,
    ],
    creative_reasoning: [
      (skillA) => `When feedback pulls in different directions, how do you decide what to keep or change in ${skillA}?`,
      (skillA, skillB) => `How do you balance originality with business fit between ${skillA} and ${skillB}?`,
    ],
    communication_service: [
      (skillA) => `When a conversation starts going off track, how do you bring it back using ${skillA}?`,
      (skillA, skillB) => `Which matters more in your day-to-day work, clarity in ${skillA} or calm under pressure in ${skillB}?`,
    ],
    analytical_business: [
      (skillA) => `When the numbers and the situation do not tell the same story, how do you investigate ${skillA}?`,
      (skillA, skillB) => `Which decisions in your role rely more on pattern-reading: ${skillA} or ${skillB}?`,
    ],
    leadership_decision_making: [
      (skillA) => `When the team needs direction but the data is incomplete, how do you decide the next move in ${skillA}?`,
      (skillA, skillB) => `How do you balance short-term pressure with long-term ownership across ${skillA} and ${skillB}?`,
    ],
  }

  const templates = byMode[role.questionMode] ?? byMode.analytical_business

  return templates.map((template, index) => ({
    id: `adaptive-${offset + index}`,
    text: template(primarySkill, secondarySkill),
    phase: "MID" as const,
    tags: [skills[index] ?? skills[0] ?? "workflow"],
    type: "BEHAVIORAL" as const,
  }))
}

function mapSkillType(bucket: string, type: Question["type"]) {
  if (type === "BEHAVIORAL") {
    return "behavioral"
  }

  if (bucket === "backend" || bucket === "frontend" || bucket === "data") {
    return "technical"
  }

  if (bucket === "performance" || bucket === "database" || bucket === "security") {
    return "technical"
  }

  return "functional"
}

function normalizeInterviewSkillType(
  value: "technical" | "functional" | "behavioral" | string
): InterviewQuestion["skill_type"] {
  if (value === "behavioral" || value === "functional" || value === "technical") {
    return value
  }

  const normalized = normalizeText(value)
  if (normalized === "analytical" || normalized === "strategic" || normalized === "operational") {
    return "functional"
  }

  return "technical"
}

function detectSignals(answer: string) {
  const normalized = normalizeText(answer)
  const vague = normalized.length < 60 || VAGUE_MARKERS.some((marker) => normalized.includes(marker))
  const strong = STRONG_MARKERS.some((marker) => normalized.includes(marker))
  return { vague, strong }
}

function clampScore(value: number) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2))
}

function extractDifficultyForExperience(level?: string): ResponseAnalysis["question_difficulty"] {
  const normalized = normalizeExperienceLevel(level)
  if (normalized === "junior") {
    return "guided"
  }
  if (normalized === "senior") {
    return "strategic"
  }
  return "scenario"
}

function detectDepthMarkers(answer: string) {
  const normalized = normalizeText(answer)
  const markers = ["because", "so that", "for example", "for instance", "first", "then", "after", "trade off", "trade-off", "decided", "measured"]
  return markers.filter((marker) => normalized.includes(marker))
}

function detectSuspicionMarkers(answer: string) {
  const normalized = normalizeText(answer)
  const markers = ["honestly", "basically", "trust me", "obviously", "as i said", "i already told", "not sure", "maybe", "kind of"]
  return markers.filter((marker) => normalized.includes(marker))
}

export function analyzeCandidateResponse(params: {
  answer: string
  skill: string
  skillType?: InterviewQuestion["skill_type"]
  fraudScore?: number
  experienceLevel?: string
  roleConfidence?: number
  adaptiveMode?: boolean
}) : ResponseAnalysis {
  const answer = params.answer ?? ""
  const normalized = normalizeText(answer)
  const words = normalized ? normalized.split(" ").filter(Boolean) : []
  const signalFlags: string[] = []

  const clarityBase =
    words.length >= 80 ? 0.92 : words.length >= 45 ? 0.78 : words.length >= 24 ? 0.62 : words.length >= 12 ? 0.44 : 0.24
  const fillerPenalty = VAGUE_MARKERS.filter((marker) => normalized.includes(marker)).length * 0.08
  const clarityScore = clampScore(clarityBase - fillerPenalty)
  if (clarityScore < 0.5) {
    signalFlags.push("low_clarity")
  }

  const depthMarkers = detectDepthMarkers(answer)
  const depthScore = clampScore(
    (words.length >= 120 ? 0.8 : words.length >= 60 ? 0.62 : words.length >= 30 ? 0.42 : 0.2) +
      Math.min(0.25, depthMarkers.length * 0.06)
  )
  if (depthScore < 0.5) {
    signalFlags.push("low_depth")
  }

  const confidenceBoost = STRONG_MARKERS.filter((marker) => normalized.includes(marker)).length * 0.06
  const confidenceScore = clampScore(
    (clarityScore * 0.45 + depthScore * 0.35 + Math.min(0.2, confidenceBoost + (normalized.includes("i ") ? 0.08 : 0))) -
      Math.max(0, fillerPenalty * 0.5)
  )
  if (confidenceScore > 0.75) {
    signalFlags.push("high_confidence")
  }

  const suspicionMarkers = detectSuspicionMarkers(answer)
  const suspicionScore = clampScore(
    (params.fraudScore ?? 0) * 0.55 +
      suspicionMarkers.length * 0.08 +
      (clarityScore < 0.35 ? 0.08 : 0) +
      (confidenceScore > 0.85 && depthScore < 0.35 ? 0.14 : 0)
  )
  if (suspicionScore > 0.55) {
    signalFlags.push("high_suspicion")
  }

  const roleClarityScore = clampScore(
    params.adaptiveMode ? ((params.roleConfidence ?? 0.35) * 0.7 + (depthScore + clarityScore) * 0.15) : Math.max(params.roleConfidence ?? 0.65, 0.65)
  )
  if (roleClarityScore < 0.45) {
    signalFlags.push("role_unclear")
  }

  const skillScore = clampScore(scoreAnswerForSkill(answer, params.skill) / 5)
  const questionDifficulty = extractDifficultyForExperience(params.experienceLevel)

  return {
    clarity_score: clarityScore,
    confidence_score: confidenceScore,
    depth_score: depthScore,
    suspicion_score: suspicionScore,
    skill_score: skillScore,
    role_clarity_score: roleClarityScore,
    question_difficulty: questionDifficulty,
    signals: signalFlags,
  }
}

function pickUniqueSkills(pool: string[], count: number, used: Set<string>) {
  const selected: string[] = []
  for (const skill of pool) {
    if (selected.length >= count) {
      break
    }
    const normalized = normalizeText(skill)
    if (used.has(normalized)) {
      continue
    }
    used.add(normalized)
    selected.push(skill)
  }

  return selected
}

function extractStructuredOutputText(response: OpenAIResponsesOutputText) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim()
  }

  const textChunks = (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" || item.type === "text")
    .map((item) => item.text ?? "")
    .join("")
    .trim()

  return textChunks || null
}

function buildInterviewQuestionId(prefix: string, index: number, skill: string) {
  const normalizedSkill = skill.replace(/\s+/g, "-").toLowerCase()
  return `${prefix}-${index}-${normalizedSkill}`
}

function normalizeSkillMatch(skill: string, candidates: string[]) {
  const normalized = normalizeText(skill)
  if (!normalized) {
    return null
  }

  const direct = candidates.find((candidate) => normalizeText(candidate) === normalized)
  if (direct) {
    return direct
  }

  const includes = candidates.find((candidate) => normalizeText(candidate).includes(normalized))
  if (includes) {
    return includes
  }

  const partial = candidates.find((candidate) => normalized.includes(normalizeText(candidate)))
  return partial ?? null
}

export function generateBaseInterviewQuestions(input: BaseGenerationInput): BaseGenerationOutput {
  const requested = resolveBaseQuestionCount(input) ?? DEFAULT_TOTAL
  const total = Math.min(MAX_BASE_QUESTIONS, Math.max(MIN_BASE_QUESTIONS, requested))
  const seed = `${input.jobDescription ?? ""}-${input.candidateResumeText ?? ""}`.slice(0, 120)
  const roleIntelligence = inferRoleIntelligence({
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription,
    coreSkills: input.coreSkills,
    resumeSkills: input.candidateResumeSkills,
    resumeText: input.candidateResumeText,
  })

  const jobSkills = sanitizeSkillList(input.coreSkills, {
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription,
  })
  const resumeSkills = sanitizeSkillList(input.candidateResumeSkills, {
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription,
  })

  const skillUniverse = buildSkillUniverse({
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription,
    coreSkills: jobSkills,
    resumeSkills,
    resumeText: input.candidateResumeText,
  })

  const normalizedJob = new Set(jobSkills.map(normalizeText))
  const normalizedResume = new Set(resumeSkills.map(normalizeText))
  const commonSkills = skillUniverse.filter(
    (skill) => normalizedJob.has(normalizeText(skill)) && normalizedResume.has(normalizeText(skill))
  )
  const missingSkills = jobSkills.filter((skill) => !normalizedResume.has(normalizeText(skill)))
  const jobCoverageSkills = jobSkills.filter((skill) => normalizedResume.has(normalizeText(skill)))

  const prioritizedSkills = prioritizeSkillsByExperience(skillUniverse, input)
  const shuffledSkills = shuffleWithSeed(prioritizedSkills, seed)
  const resumeCount = Math.max(1, Math.round(total * RESUME_RATIO))
  const jobCount = Math.max(1, Math.round(total * JOB_RATIO))
  const behavioralCount = Math.max(1, Math.round(total * BEHAVIORAL_RATIO))

  const usedSkills = new Set<string>()
  const resumeBasedSkills = pickUniqueSkills(commonSkills.length > 0 ? commonSkills : resumeSkills, resumeCount, usedSkills)
  const jobPool = missingSkills.length > 0 ? [...missingSkills, ...jobCoverageSkills] : jobSkills
  const jobBasedSkills = pickUniqueSkills(jobPool, jobCount, usedSkills)
  const behavioralSkills = pickUniqueSkills(shuffledSkills, behavioralCount, usedSkills)
  const adaptiveQuestions = roleIntelligence.adaptiveMode ? buildAdaptiveQuestions(roleIntelligence, shuffledSkills, 0) : []
  const adaptiveCount = adaptiveQuestions.length

  const resumeQuestions = buildQuestionsForSkills(resumeBasedSkills, adaptiveCount, roleIntelligence)
  const jobQuestions = buildQuestionsForSkills(jobBasedSkills, adaptiveCount + resumeQuestions.length, roleIntelligence)
  const behavioralQuestions = deriveBehavioralQuestions(
    behavioralCount,
    behavioralSkills,
    adaptiveCount + resumeQuestions.length + jobQuestions.length
  )

  const combined = [...adaptiveQuestions, ...resumeQuestions, ...jobQuestions, ...behavioralQuestions].slice(0, total)
  const regenerated = combined.map((question) => {
    const quality = validateQuestionQuality({
      question: question.text,
      jobTitle: input.jobTitle,
      jobSkills: skillUniverse,
      previousQuestions: input.previousQuestions ?? [],
      similarityThreshold: input.similarityThreshold ?? 0.8,
    })

    if (quality.status === "accepted") {
      return question
    }

    return regenerateQuestionWithValidation({
      question,
      jobTitle: input.jobTitle,
      jobSkills: skillUniverse,
      previousQuestions: input.previousQuestions ?? [],
      similarityThreshold: input.similarityThreshold ?? 0.8,
    }).question
  })

  const withSkills: EnrichedGeneratedQuestion[] = assignSkillsToQuestions(regenerated, skillUniverse)
  const coverage = computeSkillCoverage(withSkills, skillUniverse)

  const output: InterviewQuestion[] = withSkills.map((question) => ({
    id: question.id,
    question: question.text,
    skill: presentSkillName(question.skill ?? mapQuestionToSkill(question.text, skillUniverse).skill),
    skill_type: normalizeInterviewSkillType(classifySkillType(question.skill ?? mapQuestionToSkill(question.text, skillUniverse).skill)),
    skill_bucket: question.skillBucket,
  }))

  return {
    questions: output,
    skills_covered: coverage.covered,
    skills_remaining: coverage.remaining,
    meta: {
      role_family: roleIntelligence.family,
      role_subfamily: roleIntelligence.subfamily,
      role_confidence: roleIntelligence.confidence,
      adaptive_mode: roleIntelligence.adaptiveMode,
      question_mode: roleIntelligence.questionMode,
    },
  }
}

export async function generateBaseInterviewQuestionsAI(
  input: BaseGenerationInput,
  options?: { requireAi?: boolean }
): Promise<BaseGenerationOutputWithError> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim().replace(/^"|"$/g, "")
  const model = process.env.OPENAI_QUESTION_MODEL ?? OPENAI_QUESTION_MODEL
  const roleIntelligence = inferRoleIntelligence({
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription,
    coreSkills: input.coreSkills,
    resumeSkills: input.candidateResumeSkills,
    resumeText: input.candidateResumeText,
  })

  if (!apiKey) {
    return options?.requireAi
      ? {
          questions: [],
          skills_covered: [],
          skills_remaining: [],
          error_message: "Missing OPENAI_API_KEY",
          meta: {
            role_family: roleIntelligence.family,
            role_subfamily: roleIntelligence.subfamily,
            role_confidence: roleIntelligence.confidence,
            adaptive_mode: roleIntelligence.adaptiveMode,
            question_mode: roleIntelligence.questionMode,
          },
        }
      : generateBaseInterviewQuestions(input)
  }

  const requested = resolveBaseQuestionCount(input) ?? DEFAULT_TOTAL
  const total = Math.min(MAX_BASE_QUESTIONS, Math.max(MIN_BASE_QUESTIONS, requested))

  const jobSkills = sanitizeSkillList(input.coreSkills, {
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription,
  })
  const resumeSkills = sanitizeSkillList(input.candidateResumeSkills, {
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription,
  })
  const previousQuestions = input.previousQuestions ?? []

  const skillUniverse = buildSkillUniverse({
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription,
    coreSkills: jobSkills,
    resumeSkills,
    resumeText: input.candidateResumeText,
  })
  if (skillUniverse.length === 0) {
    skillUniverse.push("general")
  }

  const normalizedJob = new Set(jobSkills.map(normalizeText))
  const normalizedResume = new Set(resumeSkills.map(normalizeText))
  const commonSkills = skillUniverse.filter(
    (skill) => normalizedJob.has(normalizeText(skill)) && normalizedResume.has(normalizeText(skill))
  )
  const missingSkills = jobSkills.filter((skill) => !normalizedResume.has(normalizeText(skill)))
  const jobCoverageSkills = jobSkills.filter((skill) => normalizedResume.has(normalizeText(skill)))

  const prioritizedSkills = prioritizeSkillsByExperience(skillUniverse, input)
  const shuffledSkills = shuffleWithSeed(prioritizedSkills, `${Date.now()}-${Math.random()}`)
  const resumeCount = Math.max(1, Math.round(total * RESUME_RATIO))
  const jobCount = Math.max(1, Math.round(total * JOB_RATIO))
  const behavioralCount = Math.max(1, Math.round(total * BEHAVIORAL_RATIO))

  const usedSkills = new Set<string>()
  const resumeBasedSkills = pickUniqueSkills(commonSkills.length > 0 ? commonSkills : resumeSkills, resumeCount, usedSkills)
  const jobPool = missingSkills.length > 0 ? [...missingSkills, ...jobCoverageSkills] : jobSkills
  const jobBasedSkills = pickUniqueSkills(jobPool, jobCount, usedSkills)
  const behavioralSkills = pickUniqueSkills(shuffledSkills, behavioralCount, usedSkills)

  const requiredSkills = [...resumeBasedSkills, ...jobBasedSkills, ...behavioralSkills]
  const roleFallbackSkills = getFallbackSkillsForRoleFamily({
    jobTitle: input.jobTitle,
    jobDescription: input.jobDescription,
    coreSkills: input.coreSkills,
    resumeSkills,
    resumeText: input.candidateResumeText,
  })
  const baseCandidates = requiredSkills.length > 0 ? requiredSkills : [...skillUniverse, ...roleFallbackSkills]
  const skillCandidates = baseCandidates.length >= total
    ? baseCandidates
    : [
        ...baseCandidates,
        ...roleFallbackSkills.filter((skill) => !baseCandidates.includes(skill)).slice(0, total - baseCandidates.length),
      ]

  const accepted: InterviewQuestion[] = []
  const used = new Set<string>()
  const prev = [...previousQuestions]
  const similarityThreshold = input.similarityThreshold ?? 0.8
  const strictMode = options?.requireAi ?? false

  const maxAttempts = 5
  let lastError: string | null = null

  function basicDedupCheck(question: string) {
    const normalized = question.trim()
    if (!normalized) {
      return false
    }
    for (const prevQuestion of prev) {
      if (normalized.toLowerCase() === prevQuestion.toLowerCase()) {
        return false
      }
    }
    return true
  }

  function shouldAcceptQuestion(params: {
    question: string
    skill: string
    attempt: number
  }) {
    if (looksLikeResumeLine(params.question)) {
      return false
    }

    const skillType = classifySkillType(params.skill)
    if (skillType !== "technical" && containsForbiddenNonTechnicalPhrase(params.question)) {
      return false
    }

    if (strictMode) {
      if (!basicDedupCheck(params.question)) {
        return false
      }

      const quality = validateQuestionQuality({
        question: params.question,
        jobTitle: input.jobTitle,
        jobSkills: skillUniverse.length > 0 ? skillUniverse : [params.skill],
        previousQuestions: prev,
        similarityThreshold,
      })

      if (quality.status !== "accepted" && !quality.reason.includes("missing real-world scenario")) {
        return false
      }

      return true
    }

    const allowMissingScenario = skillType !== "technical"
    const allowSimilarityRelax = params.attempt >= 2
    const jobSkillsForValidation = skillUniverse.length > 0 ? skillUniverse : [params.skill]
    const relaxedThreshold = allowSimilarityRelax ? Math.min(0.95, similarityThreshold + 0.15) : similarityThreshold

    const quality = validateQuestionQuality({
      question: params.question,
      jobTitle: input.jobTitle,
      jobSkills: jobSkillsForValidation,
      previousQuestions: prev,
      similarityThreshold: relaxedThreshold,
    })

    if (quality.status === "accepted") {
      return true
    }

    if (allowMissingScenario && quality.reason.includes("missing real-world scenario")) {
      return true
    }

    if (allowSimilarityRelax && quality.reason.includes("too similar")) {
      return true
    }

    return false
  }

  async function requestAIQuestions(params: {
    requiredSkills: string[]
    count: number
    attemptNonce: string
  }) {
    const promptPayload = {
      job_description: input.jobDescription ?? "",
      job_title: input.jobTitle ?? "",
      job_skills: jobSkills,
      resume_skills: resumeSkills,
      resume_summary: (input.candidateResumeText ?? "").slice(0, 4000),
      role_intelligence: {
        family: roleIntelligence.family,
        subfamily: roleIntelligence.subfamily ?? null,
        confidence: roleIntelligence.confidence,
        adaptive_mode: roleIntelligence.adaptiveMode,
        question_mode: roleIntelligence.questionMode,
      },
      common_skills: commonSkills,
      missing_skills: missingSkills,
      resume_target_skills: resumeBasedSkills,
      job_target_skills: jobBasedSkills,
      behavioral_target_skills: behavioralSkills,
      required_skills: params.requiredSkills.map((skill) => presentSkillName(skill)),
      skill_type_map: Object.fromEntries(
        params.requiredSkills.map((skill) => [presentSkillName(skill), classifySkillType(skill)])
      ),
      existing_questions: prev,
      total_questions: params.count,
      variation_nonce: params.attemptNonce,
      diversity_rules: [
        "use a different phrasing pattern per question",
        "do not reuse openings across runs",
        "avoid mirroring existing questions",
      ],
      non_technical_forbidden_phrases: [
        "troubleshoot",
        "system failing",
        "optimize performance",
        "latency",
        "deployment",
        "rollback",
        "regression",
      ],
      question_style_rules: {
        technical: "use tools, systems, debugging, validation, and incident recovery",
        functional: "use workflow, prioritization, SLA handling, process control, and customer coordination",
        behavioral: "use real scenarios, ownership, communication, urgency handling, and cross-team tension",
        analytical: "use metrics, forecasting, service levels, trend reading, and decision support",
        strategic: "use planning, trade-offs, scaling the process, and long-term improvements",
        operational: "use execution, dispatch, scheduling, resource allocation, field coordination, and recovery from disruption",
      },
    }

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "Generate interview questions based on the provided skills and resume context. Rules: one question per skill, no job titles inside the question body, no locations, no generic phrases. Use structures appropriate to each skill type from question_style_rules. Follow the role_intelligence.question_mode when choosing the questioning style for this role family. Technical questions may use tools/debugging; non-technical questions must focus on workflow, scheduling, coordination, service urgency, resource allocation, stakeholders, metrics, planning, judgment, communication, or reasoning as appropriate. Use common_skills for resume-validation questions, missing_skills for coverage/probe questions, and variation_nonce to diversify phrasing across runs without mentioning it. If role_intelligence.adaptive_mode is true, make the first one or two questions exploratory and role-family-aware so the interview can refine what the candidate actually owns. For functional/behavioral/analytical/strategic/operational skills avoid technical phrases listed in non_technical_forbidden_phrases. Never quote the resume directly. Never mention awards, dates, date ranges, employer names, pasted bullet text, or sentence fragments from the resume. Convert resume context into a natural interview question about real work, judgment, ownership, planning, coordination, or execution. Output only JSON.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(promptPayload),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "interview_questions",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                questions: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      question: { type: "string" },
                      skill: { type: "string" },
                      skill_type: {
                        type: "string",
                        enum: ["technical", "functional", "behavioral", "analytical", "strategic", "operational"],
                      },
                    },
                    required: ["question", "skill", "skill_type"],
                  },
                },
              },
              required: ["questions"],
            },
          },
        },
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "")
      console.error("OpenAI question generation failed", {
        status: response.status,
        body: errorBody.slice(0, 500),
      })
      lastError = errorBody.slice(0, 500) || `OpenAI error ${response.status}`
      return []
    }

    const payload = (await response.json()) as OpenAIResponsesOutputText
    const outputText = extractStructuredOutputText(payload)
    if (!outputText) {
      lastError = "Empty OpenAI output"
      return []
    }

    const parsed = JSON.parse(outputText) as { questions: Array<{ question: string; skill: string; skill_type: string }> }
    if (!parsed || !Array.isArray(parsed.questions)) {
      lastError = "Invalid OpenAI response payload"
      return []
    }

    return parsed.questions
  }

  for (let attempt = 0; attempt < maxAttempts && accepted.length < total; attempt += 1) {
    const remainingCount = total - accepted.length
    const remainingSkills = skillCandidates.filter((skill) => !used.has(normalizeText(skill)))
    const variationNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

    try {
      const questions = await requestAIQuestions({
        requiredSkills: remainingSkills,
        count: remainingCount,
        attemptNonce: variationNonce,
      })

      for (let i = 0; i < questions.length && accepted.length < total; i += 1) {
        const item = questions[i]
        const skillMatch = normalizeSkillMatch(item.skill, skillCandidates) ?? item.skill
        const normalizedSkill = normalizeText(skillMatch)
        if (!normalizedSkill || used.has(normalizedSkill)) {
          continue
        }

        if (!shouldAcceptQuestion({ question: item.question, skill: skillMatch, attempt })) {
          continue
        }

        used.add(normalizedSkill)
        prev.push(item.question)
        accepted.push({
          id: buildInterviewQuestionId("ai", accepted.length, skillMatch),
          question: item.question,
          skill: presentSkillName(skillMatch),
          skill_type: normalizeInterviewSkillType(item.skill_type || classifySkillType(skillMatch)),
          skill_bucket: bucketSkill(skillMatch),
        })
      }
    } catch (error) {
      console.error("Failed to generate AI questions", error)
      lastError = "OpenAI request failed"
    }
  }

    if (accepted.length < total) {
      const remainingSkills = skillCandidates.filter((skill) => !used.has(normalizeText(skill)))
      for (const skill of remainingSkills) {
        if (accepted.length >= total) {
          break
        }
        let item: { question: string; skill: string; skill_type: string } | null = null
        for (let retry = 0; retry < 5 && !item; retry += 1) {
          const variationNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
          const questions = await requestAIQuestions({
            requiredSkills: [skill],
            count: 1,
            attemptNonce: variationNonce,
          })
          if (questions[0]?.question) {
            item = questions[0]
          }
        }

        if (!item) {
          continue
        }

        const skillMatch = normalizeSkillMatch(item.skill, skillCandidates) ?? skill
        const normalizedSkill = normalizeText(skillMatch)
        if (!normalizedSkill || used.has(normalizedSkill)) {
          continue
        }

        if (!shouldAcceptQuestion({ question: item.question, skill: skillMatch, attempt: 4 })) {
          continue
        }

        used.add(normalizedSkill)
        prev.push(item.question)
        accepted.push({
          id: buildInterviewQuestionId("ai", accepted.length, skillMatch),
          question: item.question,
          skill: presentSkillName(skillMatch),
          skill_type: normalizeInterviewSkillType(item.skill_type || classifySkillType(skillMatch)),
          skill_bucket: bucketSkill(skillMatch),
        })
      }
    }

    if (accepted.length < total && strictMode) {
      const remainingSkills = skillCandidates.filter((skill) => !used.has(normalizeText(skill)))
      for (const skill of remainingSkills) {
        if (accepted.length >= total) {
          break
        }
        const variationNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        const questions = await requestAIQuestions({
          requiredSkills: [skill],
          count: 1,
          attemptNonce: variationNonce,
        })
        const item = questions[0]
        if (!item?.question) {
          continue
        }
        const normalizedSkill = normalizeText(skill)
        if (used.has(normalizedSkill)) {
          continue
        }
        used.add(normalizedSkill)
        prev.push(item.question)
        accepted.push({
          id: buildInterviewQuestionId("ai", accepted.length, skill),
          question: item.question,
          skill: presentSkillName(skill),
          skill_type: normalizeInterviewSkillType(classifySkillType(skill)),
          skill_bucket: bucketSkill(skill),
        })
      }
    }

  if (accepted.length < total) {
    if (options?.requireAi) {
      const remainingSkills = skillCandidates.filter((skill) => !used.has(normalizeText(skill)))
      const filler = buildQuestionsForSkills(remainingSkills, accepted.length, roleIntelligence)
      const fillerWithSkills = assignSkillsToQuestions(filler, skillUniverse)
      for (const question of fillerWithSkills) {
        if (accepted.length >= total) {
          break
        }
        const normalizedSkill = normalizeText(question.skill ?? question.tags?.[0] ?? "")
        if (!normalizedSkill || used.has(normalizedSkill)) {
          continue
        }
        used.add(normalizedSkill)
        prev.push(question.text)
        accepted.push({
          id: question.id,
          question: question.text,
          skill: presentSkillName(question.skill ?? normalizedSkill),
          skill_type: normalizeInterviewSkillType(classifySkillType(question.skill ?? normalizedSkill)),
          skill_bucket: question.skillBucket,
        })
      }
    }

    if (accepted.length < total) {
      const fallback = generateBaseInterviewQuestions(input)
      const fallbackNeeded = total - accepted.length
      const fallbackQuestions = fallback.questions.filter((question) => !used.has(normalizeText(question.skill))).slice(0, fallbackNeeded)
      accepted.push(...fallbackQuestions)
    }
  }

  const coverage = computeSkillCoverage(accepted, skillUniverse)

  return {
    questions: accepted,
    skills_covered: coverage.covered,
    skills_remaining: coverage.remaining,
    meta: {
      role_family: roleIntelligence.family,
      role_subfamily: roleIntelligence.subfamily,
      role_confidence: roleIntelligence.confidence,
      adaptive_mode: roleIntelligence.adaptiveMode,
      question_mode: roleIntelligence.questionMode,
    },
  }
}

export function decideNextQuestion(input: NextQuestionInput): NextQuestionDecision {
  const fraudScore = input.fraudScore ?? 0
  const analysis =
    input.responseAnalysis ??
    (input.lastQuestion && input.lastAnswer
      ? analyzeCandidateResponse({
          answer: input.lastAnswer,
          skill: input.lastQuestion.skill,
          skillType: input.lastQuestion.skill_type,
          fraudScore,
          experienceLevel: input.experienceLevel,
          roleConfidence: input.roleConfidence,
          adaptiveMode: input.adaptiveMode,
        })
      : undefined)
  const skillScore = input.skillScore ?? analysis?.skill_score ?? 1
  const followupCount = input.followupCount ?? 0
  const remaining = input.skillsRemaining ?? []
  const difficulty = analysis?.question_difficulty ?? extractDifficultyForExperience(input.experienceLevel)

  if ((analysis?.suspicion_score ?? fraudScore) >= 0.7 && input.lastQuestion) {
    return {
      intent: "contradiction",
      followUp: {
        follow_up_question: "You mentioned earlier a different detail. Can you clarify what actually happened?",
        intent: "contradiction",
      },
      difficulty,
      updatedEvaluation: analysis,
    }
  }

  if ((analysis?.role_clarity_score ?? 1) < 0.45 && followupCount < 2 && input.lastQuestion) {
    return {
      intent: "exploratory",
      followUp: generateFollowUp({
        lastQuestion: input.lastQuestion,
        candidateAnswer: input.lastAnswer ?? "",
        skillScore,
        fraudScore,
        responseAnalysis: analysis,
        experienceLevel: input.experienceLevel,
        adaptiveMode: true,
        questionMode: input.questionMode,
      }),
      difficulty,
      updatedEvaluation: analysis,
    }
  }

  if (skillScore < 0.6 && followupCount < 3 && input.lastQuestion && input.lastAnswer) {
    return {
      intent: "followup",
      followUp: generateFollowUp({
        lastQuestion: input.lastQuestion,
        candidateAnswer: input.lastAnswer,
        skillScore,
        fraudScore,
        responseAnalysis: analysis,
        experienceLevel: input.experienceLevel,
        adaptiveMode: input.adaptiveMode,
        questionMode: input.questionMode,
      }),
      difficulty,
      updatedEvaluation: analysis,
    }
  }

  if (analysis && analysis.clarity_score < 0.5 && followupCount < 3 && input.lastQuestion && input.lastAnswer) {
    return {
      intent: "followup",
      followUp: generateFollowUp({
        lastQuestion: input.lastQuestion,
        candidateAnswer: input.lastAnswer,
        skillScore,
        fraudScore,
        responseAnalysis: analysis,
        experienceLevel: input.experienceLevel,
        adaptiveMode: input.adaptiveMode,
        questionMode: input.questionMode,
      }),
      difficulty,
      updatedEvaluation: analysis,
    }
  }

  if (analysis && analysis.depth_score < 0.5 && followupCount < 3 && input.lastQuestion && input.lastAnswer) {
    return {
      intent: "followup",
      followUp: generateFollowUp({
        lastQuestion: input.lastQuestion,
        candidateAnswer: input.lastAnswer,
        skillScore,
        fraudScore,
        responseAnalysis: analysis,
        experienceLevel: input.experienceLevel,
        adaptiveMode: input.adaptiveMode,
        questionMode: input.questionMode,
      }),
      difficulty,
      updatedEvaluation: analysis,
    }
  }

  if (remaining.length === 0) {
    return { intent: "next_skill", nextSkill: undefined, difficulty, updatedEvaluation: analysis }
  }

  const timeRemaining = input.timeRemainingSeconds ?? Number.POSITIVE_INFINITY
  const critical =
    input.criticalSkills ??
    deriveCriticalSkills(remaining, {
      experienceLevel: input.experienceLevel,
      coreSkills: remaining,
    })

  if (timeRemaining < remaining.length * 90 && critical.length > 0) {
    return { intent: "next_skill", nextSkill: critical[0], difficulty, updatedEvaluation: analysis }
  }

  if (analysis && analysis.confidence_score > 0.78 && analysis.depth_score > 0.6 && critical.length > 0) {
    return { intent: "next_skill", nextSkill: critical[0], difficulty, updatedEvaluation: analysis }
  }

  return { intent: "next_skill", nextSkill: remaining[0], difficulty, updatedEvaluation: analysis }
}

export function generateFollowUp(
  input: FollowUpInput & {
    responseAnalysis?: ResponseAnalysis
    experienceLevel?: string
    adaptiveMode?: boolean
    questionMode?: string
  }
): FollowUpResult {
  const answer = input.candidateAnswer ?? ""
  const signals = detectSignals(answer)
  const analysis =
    input.responseAnalysis ??
    analyzeCandidateResponse({
      answer,
      skill: input.lastQuestion.skill,
      skillType: input.lastQuestion.skill_type,
      fraudScore: input.fraudScore,
      experienceLevel: input.experienceLevel,
      adaptiveMode: input.adaptiveMode,
    })
  const fraudScore = input.fraudScore ?? 0
  const skillLabel = presentSkillName(input.lastQuestion.skill)

  if (fraudScore >= 0.7 || analysis.suspicion_score >= 0.7) {
    return {
      follow_up_question: "Can you walk me through that step-by-step so the timeline is clear?",
      intent: "contradiction",
    }
  }

  if (analysis.role_clarity_score < 0.45) {
    return {
      follow_up_question: `Which part of ${skillLabel} do you personally own most often, and how does it usually show up in your day-to-day work?`,
      intent: "exploratory",
    }
  }

  if (analysis.clarity_score < 0.5 || signals.vague) {
    return {
      follow_up_question:
        input.experienceLevel && normalizeExperienceLevel(input.experienceLevel) === "junior"
          ? `Could you explain that in a simpler step-by-step way using one recent example from ${skillLabel}?`
          : `Could you restate that more clearly and walk me through the sequence you followed in ${skillLabel}?`,
      intent: "simplification",
    }
  }

  if (analysis.depth_score < 0.5) {
    return {
      follow_up_question: `Can you give me one concrete example where ${skillLabel} made the outcome better or worse?`,
      intent: "clarification",
    }
  }

  if (analysis.confidence_score > 0.78 && analysis.depth_score > 0.6) {
    return {
      follow_up_question:
        normalizeExperienceLevel(input.experienceLevel) === "senior"
          ? `What ambiguity or strategic trade-off makes ${skillLabel} hard at your level, and how do you make the call?`
          : `What is an edge case where your approach to ${skillLabel} failed, and how did you recover?`,
      intent: "difficulty_up",
    }
  }

  return {
    follow_up_question: `What would you do differently next time you faced a ${skillLabel} issue?`,
    intent: "probe",
  }
}

export async function generateFollowUpWithAI(input: FollowUpInput): Promise<FollowUpResult> {
  const fallback = generateFollowUp(input)
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return fallback
  }

  const fraudScore = input.fraudScore ?? 0
  if (fraudScore >= 0.7) {
    return fallback
  }

  const signals = detectSignals(input.candidateAnswer ?? "")
  const model = process.env.OPENAI_FOLLOWUP_MODEL ?? OPENAI_FOLLOWUP_MODEL

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "You are generating one adaptive interview follow-up question. Be specific to the candidate answer, skill-focused, concise, and professional. Avoid job titles, locations, and generic phrases like 'tell me about a time'. Use simplification if clarity is low, exploratory if role ownership is still unclear, contradiction if suspicion is high, difficulty_up when the answer is strong and should be stretched, and probe for deeper detail when needed. Return JSON only.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  last_question: input.lastQuestion.question,
                  skill: input.lastQuestion.skill,
                  skill_type: input.lastQuestion.skill_type,
                  answer: input.candidateAnswer,
                  skill_score: input.skillScore ?? null,
                  fraud_score: fraudScore,
                  signals,
                  response_analysis: fallback,
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "follow_up",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                follow_up_question: { type: "string" },
                intent: {
                  type: "string",
                  enum: ["clarification", "probe", "contradiction", "exploratory", "simplification", "difficulty_up"],
                },
              },
              required: ["follow_up_question", "intent"],
            },
          },
        },
      }),
    })

    if (!response.ok) {
      return fallback
    }

    const payload = (await response.json()) as OpenAIResponsesOutputText
    const outputText = extractStructuredOutputText(payload)
    if (!outputText) {
      return fallback
    }

    const parsed = JSON.parse(outputText) as FollowUpResult
    if (
      !parsed ||
      typeof parsed.follow_up_question !== "string" ||
      !["clarification", "probe", "contradiction", "exploratory", "simplification", "difficulty_up"].includes(parsed.intent)
    ) {
      return fallback
    }

    const normalizedQuestion = normalizeText(parsed.follow_up_question)
    if (!normalizedQuestion || normalizedQuestion.length < 8) {
      return fallback
    }

    return parsed
  } catch (error) {
    console.error("Failed to generate AI follow-up", error)
    return fallback
  }
}

export function updateSkillState(params: {
  skill: string
  skillsCovered: string[]
  skillsRemaining: string[]
}) {
  const normalizedSkill = normalizeSkillName(params.skill)
  const covered = new Set(params.skillsCovered.map(normalizeSkillName))
  covered.add(normalizedSkill)
  const remaining = params.skillsRemaining
    .map(normalizeSkillName)
    .filter((skill) => skill !== normalizedSkill)

  return {
    skills_covered: Array.from(covered),
    skills_remaining: remaining,
  }
}

export function evaluateCandidateResponse(params: {
  skill: string
  answer: string
  skillType?: InterviewQuestion["skill_type"]
  fraudScore?: number
  experienceLevel?: string
  roleConfidence?: number
  adaptiveMode?: boolean
}) {
  return analyzeCandidateResponse({
    answer: params.answer,
    skill: params.skill,
    skillType: params.skillType,
    fraudScore: params.fraudScore,
    experienceLevel: params.experienceLevel,
    roleConfidence: params.roleConfidence,
    adaptiveMode: params.adaptiveMode,
  })
}

export function scoreAnswer(skill: string, answer: string) {
  return scoreAnswerForSkill(answer, skill) / 5
}
