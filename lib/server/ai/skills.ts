export type SkillBucket =
  | "database"
  | "performance"
  | "operations"
  | "security"
  | "backend"
  | "frontend"
  | "data"
  | "general"

export type SkillType =
  | "technical"
  | "functional"
  | "behavioral"
  | "analytical"
  | "strategic"
  | "operational"

export type SkillUniverseInput = {
  jobDescription?: string
  coreSkills?: string[]
  resumeSkills?: string[]
}

export type SkillCoverage = {
  covered: string[]
  remaining: string[]
}

export type SkillScore = {
  skill: string
  bucket: SkillBucket
  average: number
  samples: number
}

export type SkillProfile = {
  skill_scores: Record<string, SkillScore>
  strengths: string[]
  weaknesses: string[]
  overall_weighted_score?: number
}

export type BucketWeights = Partial<Record<SkillBucket, number>>

const SKILL_SYNONYMS: Record<string, string> = {
  postgres: "postgresql",
  postgresql: "postgresql",
  mysql: "mysql",
  sql: "sql",
  mongodb: "mongodb",
  mongo: "mongodb",
  redis: "redis",
  "db tuning": "performance_optimization",
  "database tuning": "performance_optimization",
  "performance tuning": "performance_optimization",
  "query optimization": "performance_optimization",
  "load testing": "performance_optimization",
  "incident response": "operations",
  "on call": "operations",
  "on-call": "operations",
  "site reliability": "operations",
  "sre": "operations",
  "devops": "operations",
  "ci/cd": "operations",
  "ci cd": "operations",
  "kubernetes": "operations",
  "docker": "operations",
  "aws": "operations",
  "azure": "operations",
  "gcp": "operations",
  "security": "security",
  "auth": "security",
  "authentication": "security",
  "authorization": "security",
  "api": "backend",
  "rest": "backend",
  "graphql": "backend",
  "node": "backend",
  "node.js": "backend",
  "javascript": "backend",
  "typescript": "backend",
  "react": "frontend",
  "next.js": "frontend",
  "next": "frontend",
  "html": "frontend",
  "css": "frontend",
  "data pipeline": "data",
  "etl": "data",
  "analytics": "data",
}

const SKILL_KEYWORDS = [
  "postgresql",
  "mysql",
  "sql",
  "mongodb",
  "redis",
  "database",
  "indexing",
  "replication",
  "backup",
  "performance tuning",
  "query optimization",
  "performance",
  "latency",
  "monitoring",
  "logging",
  "incident",
  "on-call",
  "sre",
  "devops",
  "kubernetes",
  "docker",
  "aws",
  "azure",
  "gcp",
  "security",
  "encryption",
  "oauth",
  "jwt",
  "api",
  "rest",
  "graphql",
  "node",
  "typescript",
  "javascript",
  "react",
  "next.js",
  "etl",
  "data pipeline",
  "analytics",
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

const FUNCTIONAL_SKILL_HINTS = [
  "scheduling",
  "resource allocation",
  "resource planning",
  "capacity planning",
  "workflow",
  "process",
  "prioritization",
  "roadmap",
  "delivery",
  "stakeholder",
  "billing",
  "crm",
  "accounting",
  "payroll",
  "compliance",
]

const BEHAVIORAL_SKILL_HINTS = [
  "communication",
  "coordination",
  "collaboration",
  "conflict",
  "leadership",
  "ownership",
  "feedback",
  "mentoring",
  "empathy",
  "influence",
]

const ANALYTICAL_SKILL_HINTS = [
  "analysis",
  "analytics",
  "metrics",
  "reporting",
  "insights",
  "forecasting",
  "data-driven",
  "kpi",
]

const STRATEGIC_SKILL_HINTS = [
  "strategy",
  "strategic",
  "roadmap",
  "vision",
  "long-term",
  "business planning",
  "market",
  "go-to-market",
]

const OPERATIONAL_SKILL_HINTS = [
  "execution",
  "operations",
  "operational",
  "coordination",
  "resource handling",
  "logistics",
  "fulfillment",
  "service delivery",
]

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

export function normalizeSkillName(raw: string) {
  const normalized = normalizeText(raw)
  return SKILL_SYNONYMS[normalized] ?? normalized
}

function extractSkillsFromText(text?: string) {
  if (!text) {
    return []
  }

  const normalizedText = normalizeText(text)
  return SKILL_KEYWORDS.filter((skill) => normalizedText.includes(normalizeText(skill)))
}

export function buildSkillUniverse(input: SkillUniverseInput) {
  const skills = new Set<string>()

  input.coreSkills?.forEach((skill) => {
    const normalized = normalizeSkillName(skill)
    if (normalized) {
      skills.add(normalized)
    }
  })

  input.resumeSkills?.forEach((skill) => {
    const normalized = normalizeSkillName(skill)
    if (normalized) {
      skills.add(normalized)
    }
  })

  extractSkillsFromText(input.jobDescription).forEach((skill) => {
    skills.add(normalizeSkillName(skill))
  })

  return Array.from(skills)
}

export function bucketSkill(skill: string): SkillBucket {
  const normalized = normalizeSkillName(skill)

  if (["postgresql", "mysql", "mongodb", "sql", "database", "indexing", "replication", "backup"].includes(normalized)) {
    return "database"
  }

  if (["performance_optimization", "performance", "latency", "query optimization"].includes(normalized)) {
    return "performance"
  }

  if (["operations", "devops", "kubernetes", "docker", "aws", "azure", "gcp", "monitoring", "logging"].includes(normalized)) {
    return "operations"
  }

  if (["security", "auth", "authentication", "authorization", "encryption", "jwt", "oauth"].includes(normalized)) {
    return "security"
  }

  if (["api", "rest", "graphql", "node", "node.js", "typescript", "javascript"].includes(normalized)) {
    return "backend"
  }

  if (["react", "next.js", "next", "html", "css"].includes(normalized)) {
    return "frontend"
  }

  if (["data", "etl", "data pipeline", "analytics"].includes(normalized)) {
    return "data"
  }

  return "general"
}

export function classifySkillType(skill: string): SkillType {
  const normalized = normalizeSkillName(skill)

  if (BEHAVIORAL_SKILL_HINTS.some((hint) => normalized.includes(hint))) {
    return "behavioral"
  }

  if (ANALYTICAL_SKILL_HINTS.some((hint) => normalized.includes(hint))) {
    return "analytical"
  }

  if (STRATEGIC_SKILL_HINTS.some((hint) => normalized.includes(hint))) {
    return "strategic"
  }

  if (OPERATIONAL_SKILL_HINTS.some((hint) => normalized.includes(hint))) {
    return "operational"
  }

  if (FUNCTIONAL_SKILL_HINTS.some((hint) => normalized.includes(hint))) {
    return "functional"
  }

  const bucket = bucketSkill(normalized)
  if (bucket !== "general") {
    return "technical"
  }

  return "functional"
}

export function mapQuestionToSkill(questionText: string, skills: string[]) {
  const normalizedText = normalizeText(questionText)
  const normalizedSkills = skills.map((skill) => normalizeSkillName(skill))

  const matched = normalizedSkills.find((skill) => normalizedText.includes(skill))
  const fallback = normalizedSkills[0]
  const skill = matched ?? fallback ?? "general"

  return {
    skill,
    bucket: bucketSkill(skill),
  }
}

export function assignSkillsToQuestions<T extends { text: string; tags?: string[] }>(questions: T[], skills: string[]) {
  return questions.map((question) => {
    const derived = mapQuestionToSkill(question.text, skills)
    const tags = Array.isArray(question.tags) ? question.tags : []
    const normalizedSkill = normalizeSkillName(derived.skill)
    const nextTags = tags.includes(normalizedSkill) ? tags : [...tags, normalizedSkill]

    return {
      ...question,
      tags: nextTags,
      skill: normalizedSkill,
      skillBucket: derived.bucket,
    }
  })
}

export function computeSkillCoverage(questions: Array<{ skill?: string }>, skills: string[]): SkillCoverage {
  const covered = new Set<string>()
  questions.forEach((question) => {
    if (question.skill) {
      covered.add(normalizeSkillName(question.skill))
    }
  })

  const normalizedSkills = skills.map((skill) => normalizeSkillName(skill))
  const remaining = normalizedSkills.filter((skill) => !covered.has(skill))

  return {
    covered: Array.from(covered),
    remaining,
  }
}

export function scoreAnswerForSkill(answer: string, skill: string) {
  const normalizedAnswer = normalizeText(answer)
  const normalizedSkill = normalizeSkillName(skill)

  let score = 1
  if (normalizedAnswer.includes(normalizedSkill)) {
    score += 2
  }

  if (SCENARIO_KEYWORDS.some((keyword) => normalizedAnswer.includes(keyword))) {
    score += 1
  }

  if (answer.trim().length > 80) {
    score += 1
  }

  return Math.min(5, score)
}

export function aggregateSkillScores(entries: Array<{ skill: string; bucket: SkillBucket; score: number }>, bucketWeights?: BucketWeights): SkillProfile {
  const aggregates = new Map<string, { bucket: SkillBucket; total: number; count: number }>()
  const weights = bucketWeights ?? {}
  let weightedTotal = 0
  let weightedCount = 0

  entries.forEach((entry) => {
    const key = normalizeSkillName(entry.skill)
    const current = aggregates.get(key) ?? { bucket: entry.bucket, total: 0, count: 0 }
    aggregates.set(key, {
      bucket: entry.bucket,
      total: current.total + entry.score,
      count: current.count + 1,
    })

    const weight = typeof weights[entry.bucket] === "number" ? Number(weights[entry.bucket]) : 1
    weightedTotal += entry.score * weight
    weightedCount += weight
  })

  const skillScores: Record<string, SkillScore> = {}
  const ranked = Array.from(aggregates.entries()).map(([skill, data]) => {
    const average = data.count > 0 ? Number((data.total / data.count).toFixed(2)) : 0
    skillScores[skill] = {
      skill,
      bucket: data.bucket,
      average,
      samples: data.count,
    }

    return { skill, average }
  })

  ranked.sort((a, b) => b.average - a.average)

  const overallWeightedScore = weightedCount > 0 ? Number((weightedTotal / weightedCount).toFixed(2)) : 0

  return {
    skill_scores: skillScores,
    strengths: ranked.slice(0, 3).map((item) => item.skill),
    weaknesses: ranked.slice(-3).map((item) => item.skill),
    overall_weighted_score: overallWeightedScore,
  }
}
