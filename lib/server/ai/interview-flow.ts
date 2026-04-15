import { Question } from "@/lib/server/ai/behavioral"
import { regenerateQuestionWithValidation, validateQuestionQuality } from "@/lib/server/ai/brain"
import {
  assignSkillsToQuestions,
  buildSkillUniverse,
  bucketSkill,
  classifySkillType,
  computeSkillCoverage,
  mapQuestionToSkill,
  normalizeSkillName,
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

export type BaseGenerationOutput = {
  questions: InterviewQuestion[]
  skills_covered: string[]
  skills_remaining: string[]
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
}

export type NextQuestionDecision = {
  intent: "followup" | "next_skill" | "contradiction"
  nextSkill?: string
  followUp?: FollowUpResult
}

export type FollowUpInput = {
  lastQuestion: InterviewQuestion
  candidateAnswer: string
  skillScore?: number
  fraudScore?: number
}

export type FollowUpResult = {
  follow_up_question: string
  intent: "clarification" | "probe" | "contradiction"
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

const JUNIOR_CRITICAL = ["sql", "database", "api", "debug", "testing", "performance"]
const MID_CRITICAL = ["performance", "security", "operations", "database", "api"]
const SENIOR_CRITICAL = ["performance", "security", "operations", "architecture", "scalability", "compliance"]

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

function prioritizeSkillsByExperience(skills: string[], experienceLevel?: string) {
  const level = normalizeExperienceLevel(experienceLevel)
  const critical =
    level === "junior" ? JUNIOR_CRITICAL : level === "senior" ? SENIOR_CRITICAL : MID_CRITICAL

  const normalizedCritical = critical.map((skill) => normalizeText(skill))
  return [...skills].sort((a, b) => {
    const aHit = normalizedCritical.some((crit) => normalizeText(a).includes(crit))
    const bHit = normalizedCritical.some((crit) => normalizeText(b).includes(crit))
    if (aHit === bHit) {
      return 0
    }
    return aHit ? -1 : 1
  })
}

function deriveCriticalSkills(skills: string[], experienceLevel?: string) {
  const ordered = prioritizeSkillsByExperience(skills, experienceLevel)
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

function buildQuestionsForSkills(skills: string[], offset: number) {
  const technicalTemplates = [
    (skill: string, index: number) => pickQuestionTemplate(index, skill),
    (skill: string) => `How do you troubleshoot a ${skill} regression during a deployment?`,
    (skill: string) => `What metrics would you monitor to validate ${skill} after a release?`,
    (skill: string) => `How do you decide between rollback and hotfix when ${skill} causes an incident?`,
  ]

  const functionalTemplates = [
    (skill: string) => `How do you prioritize work when ${skill} demands compete?`,
    (skill: string) => `Walk me through a decision you made that improved ${skill}.`,
    (skill: string) => `What steps do you follow to keep ${skill} on track?`,
    (skill: string) => `How do you handle trade-offs while managing ${skill}?`,
  ]

  const behavioralTemplates = [
    (skill: string) => `Walk me through a situation where ${skill} mattered under pressure.`,
    (skill: string) => `How do you handle conflict when ${skill} is tested?`,
    (skill: string) => `Walk me through a moment where ${skill} changed the outcome.`,
    (skill: string) => `How do you build trust through ${skill} in a tight deadline?`,
  ]

  const analyticalTemplates = [
    (skill: string) => `What signals do you monitor to evaluate ${skill}?`,
    (skill: string) => `How do you use data to make decisions about ${skill}?`,
    (skill: string) => `Walk me through how you validate ${skill} with metrics.`,
    (skill: string) => `Which KPI best reflects success for ${skill}, and why?`,
  ]

  const strategicTemplates = [
    (skill: string) => `How do you plan long-term improvements around ${skill}?`,
    (skill: string) => `What trade-offs do you consider when setting strategy for ${skill}?`,
    (skill: string) => `Walk me through a strategic decision you made about ${skill}.`,
    (skill: string) => `How do you align stakeholders when ${skill} strategy changes?`,
  ]

  const operationalTemplates = [
    (skill: string) => `How do you keep ${skill} execution on schedule?`,
    (skill: string) => `What steps help you coordinate ${skill} across teams?`,
    (skill: string) => `How do you handle resource constraints in ${skill}?`,
    (skill: string) => `Walk me through your process to maintain ${skill} day to day.`,
  ]

  return skills.map((skill, idx) => ({
    id: `q-${offset + idx}-${skill.replace(/\s+/g, "-")}`,
    text: (() => {
      const type = classifySkillType(skill)
      const templateSet =
        type === "behavioral"
          ? behavioralTemplates
          : type === "functional"
          ? functionalTemplates
          : type === "analytical"
          ? analyticalTemplates
          : type === "strategic"
          ? strategicTemplates
          : type === "operational"
          ? operationalTemplates
          : technicalTemplates
      const template = templateSet[(offset + idx) % templateSet.length]
      return template(skill, offset + idx)
    })(),
    phase: "MID" as const,
    tags: [skill],
    type: (classifySkillType(skill) === "behavioral"
      ? "BEHAVIORAL"
      : "TECHNICAL") as const,
  }))
}

function deriveBehavioralQuestions(count: number, skills: string[], offset: number) {
  const pool = skills.length ? skills : ["leadership", "communication"]
  const behavioral: Question[] = []

  for (let i = 0; i < count; i += 1) {
    const skill = pool[(offset + i) % pool.length]
    behavioral.push({
      id: `behavioral-${offset + i}`,
      text: `Can you walk me through a situation where you owned a ${skill} decision under pressure?`,
      phase: "MID",
      tags: [skill],
      type: "BEHAVIORAL",
    })
  }

  return behavioral
}

function mapSkillType(bucket: string, type: Question["type"]) {
  if (type === "BEHAVIORAL") {
    return "behavioral"
  }

  if (bucket === "operations" || bucket === "performance" || bucket === "database" || bucket === "security") {
    return "technical"
  }

  if (bucket === "backend" || bucket === "frontend" || bucket === "data") {
    return "technical"
  }

  return "functional"
}

function detectSignals(answer: string) {
  const normalized = normalizeText(answer)
  const vague = normalized.length < 60 || VAGUE_MARKERS.some((marker) => normalized.includes(marker))
  const strong = STRONG_MARKERS.some((marker) => normalized.includes(marker))
  return { vague, strong }
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

  const jobSkills = input.coreSkills ?? []
  const resumeSkills = input.candidateResumeSkills ?? []

  const skillUniverse = buildSkillUniverse({
    jobDescription: input.jobDescription,
    coreSkills: jobSkills,
    resumeSkills,
  })

  const normalizedJob = new Set(jobSkills.map(normalizeText))
  const normalizedResume = new Set(resumeSkills.map(normalizeText))
  const commonSkills = skillUniverse.filter(
    (skill) => normalizedJob.has(normalizeText(skill)) && normalizedResume.has(normalizeText(skill))
  )
  const missingSkills = jobSkills.filter((skill) => !normalizedResume.has(normalizeText(skill)))
  const jobCoverageSkills = jobSkills.filter((skill) => normalizedResume.has(normalizeText(skill)))

  const prioritizedSkills = prioritizeSkillsByExperience(skillUniverse, input.experienceLevel)
  const shuffledSkills = shuffleWithSeed(prioritizedSkills, seed)
  const resumeCount = Math.max(1, Math.round(total * RESUME_RATIO))
  const jobCount = Math.max(1, Math.round(total * JOB_RATIO))
  const behavioralCount = Math.max(1, Math.round(total * BEHAVIORAL_RATIO))

  const usedSkills = new Set<string>()
  const resumeBasedSkills = pickUniqueSkills(commonSkills.length > 0 ? commonSkills : resumeSkills, resumeCount, usedSkills)
  const jobPool = missingSkills.length > 0 ? [...missingSkills, ...jobCoverageSkills] : jobSkills
  const jobBasedSkills = pickUniqueSkills(jobPool, jobCount, usedSkills)
  const behavioralSkills = pickUniqueSkills(shuffledSkills, behavioralCount, usedSkills)

  const resumeQuestions = buildQuestionsForSkills(resumeBasedSkills, 0)
  const jobQuestions = buildQuestionsForSkills(jobBasedSkills, resumeQuestions.length)
  const behavioralQuestions = deriveBehavioralQuestions(behavioralCount, behavioralSkills, resumeQuestions.length + jobQuestions.length)

  const combined = [...resumeQuestions, ...jobQuestions, ...behavioralQuestions]
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

  const withSkills = assignSkillsToQuestions(regenerated, skillUniverse)
  const coverage = computeSkillCoverage(withSkills, skillUniverse)

  const output: InterviewQuestion[] = withSkills.map((question) => ({
    id: question.id,
    question: question.text,
    skill: normalizeSkillName(question.skill ?? mapQuestionToSkill(question.text, skillUniverse).skill),
    skill_type: mapSkillType(question.skillBucket ?? bucketSkill(question.skill ?? "general"), question.type),
    skill_bucket: question.skillBucket,
  }))

  return {
    questions: output,
    skills_covered: coverage.covered,
    skills_remaining: coverage.remaining,
  }
}

export async function generateBaseInterviewQuestionsAI(
  input: BaseGenerationInput,
  options?: { requireAi?: boolean }
): Promise<BaseGenerationOutputWithError> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim().replace(/^"|"$/g, "")
  const model = process.env.OPENAI_QUESTION_MODEL ?? OPENAI_QUESTION_MODEL

  if (!apiKey) {
    return options?.requireAi
      ? { questions: [], skills_covered: [], skills_remaining: [], error_message: "Missing OPENAI_API_KEY" }
      : generateBaseInterviewQuestions(input)
  }

  const requested = resolveBaseQuestionCount(input) ?? DEFAULT_TOTAL
  const total = Math.min(MAX_BASE_QUESTIONS, Math.max(MIN_BASE_QUESTIONS, requested))

  const jobSkills = input.coreSkills ?? []
  const resumeSkills = input.candidateResumeSkills ?? []
  const previousQuestions = input.previousQuestions ?? []

  const skillUniverse = buildSkillUniverse({
    jobDescription: input.jobDescription,
    coreSkills: jobSkills,
    resumeSkills,
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

  const prioritizedSkills = prioritizeSkillsByExperience(skillUniverse, input.experienceLevel)
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
  const baseCandidates = requiredSkills.length > 0 ? requiredSkills : skillUniverse
  const skillCandidates = baseCandidates.length >= total
    ? baseCandidates
    : [
        ...baseCandidates,
        ...Array.from({ length: total - baseCandidates.length }, (_, index) => `general-skill-${index + 1}`),
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
    if (strictMode) {
      return basicDedupCheck(params.question)
    }

    const skillType = classifySkillType(params.skill)
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
      job_skills: jobSkills,
      resume_skills: resumeSkills,
      common_skills: commonSkills,
      missing_skills: missingSkills,
      resume_target_skills: resumeBasedSkills,
      job_target_skills: jobBasedSkills,
      behavioral_target_skills: behavioralSkills,
      required_skills: params.requiredSkills,
      skill_type_map: Object.fromEntries(
        params.requiredSkills.map((skill) => [skill, classifySkillType(skill)])
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
      ],
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
                  "Generate interview questions based on the provided skills. Rules: one question per skill, no job titles, no locations, no generic phrases. Use varied structures (scenario, tool, troubleshooting, decision). Avoid repeating phrasing. Use variation_nonce to diversify output across runs but never mention it. Use skill_type_map to shape each question's style. For functional/behavioral/analytical/strategic/operational skills avoid technical phrases listed in non_technical_forbidden_phrases. Output only JSON.",
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
                        enum: ["technical", "functional", "behavioral"],
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
          skill: normalizeSkillName(skillMatch),
          skill_type:
            item.skill_type === "behavioral" ||
            item.skill_type === "functional" ||
            item.skill_type === "technical"
              ? item.skill_type
              : classifySkillType(skillMatch),
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
          skill: normalizeSkillName(skillMatch),
          skill_type:
            item.skill_type === "behavioral" ||
            item.skill_type === "functional" ||
            item.skill_type === "technical"
              ? item.skill_type
              : classifySkillType(skillMatch),
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
          skill: normalizeSkillName(skill),
          skill_type: classifySkillType(skill),
          skill_bucket: bucketSkill(skill),
        })
      }
    }

  if (accepted.length < total) {
    if (options?.requireAi) {
      const remainingSkills = skillCandidates.filter((skill) => !used.has(normalizeText(skill)))
      const filler = buildQuestionsForSkills(remainingSkills, accepted.length)
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
          skill: normalizeSkillName(question.skill ?? normalizedSkill),
          skill_type: mapSkillType(question.skillBucket ?? bucketSkill(normalizedSkill), question.type),
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
  }
}

export function decideNextQuestion(input: NextQuestionInput): NextQuestionDecision {
  const fraudScore = input.fraudScore ?? 0
  const skillScore = input.skillScore ?? 1
  const followupCount = input.followupCount ?? 0
  const remaining = input.skillsRemaining ?? []

  if (fraudScore >= 0.7 && input.lastQuestion) {
    return {
      intent: "contradiction",
      followUp: {
        follow_up_question: "You mentioned earlier a different detail. Can you clarify what actually happened?",
        intent: "contradiction",
      },
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
      }),
    }
  }

  if (remaining.length === 0) {
    return { intent: "next_skill", nextSkill: undefined }
  }

  const timeRemaining = input.timeRemainingSeconds ?? Number.POSITIVE_INFINITY
  const critical = input.criticalSkills ?? deriveCriticalSkills(remaining, input.experienceLevel)

  if (timeRemaining < remaining.length * 90 && critical.length > 0) {
    return { intent: "next_skill", nextSkill: critical[0] }
  }

  return { intent: "next_skill", nextSkill: remaining[0] }
}

export function generateFollowUp(input: FollowUpInput): FollowUpResult {
  const answer = input.candidateAnswer ?? ""
  const signals = detectSignals(answer)
  const fraudScore = input.fraudScore ?? 0

  if (fraudScore >= 0.7) {
    return {
      follow_up_question: "Can you walk me through that step-by-step so the timeline is clear?",
      intent: "contradiction",
    }
  }

  if (signals.vague) {
    return {
      follow_up_question: `Can you share a specific example of how you handled ${input.lastQuestion.skill}?`,
      intent: "clarification",
    }
  }

  if (signals.strong) {
    return {
      follow_up_question: `What is an edge case where your approach to ${input.lastQuestion.skill} failed, and how did you recover?`,
      intent: "probe",
    }
  }

  return {
    follow_up_question: `What would you do differently next time you faced a ${input.lastQuestion.skill} issue?`,
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
                  "You are generating one interview follow-up question. Be specific to the candidate answer, skill-focused, concise, and professional. Avoid job titles, locations, and generic phrases like 'tell me about a time'. Return JSON only.",
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
                  enum: ["clarification", "probe", "contradiction"],
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
      (parsed.intent !== "clarification" && parsed.intent !== "probe" && parsed.intent !== "contradiction")
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

export function scoreAnswer(skill: string, answer: string) {
  return scoreAnswerForSkill(answer, skill) / 5
}
