import { normalizeSkillName, scoreAnswerForSkill } from "@/lib/server/ai/skills"

type SkillType =
  | "technical"
  | "functional"
  | "behavioral"
  | "analytical"
  | "strategic"
  | "operational"

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

const VAGUE_MARKERS = ["not sure", "maybe", "i think", "not certain", "somehow"]
const STRONG_MARKERS = ["always", "never", "definitely", "absolutely"]

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

function clampScore(value: number) {
  return Number(Math.max(0, Math.min(1, value)).toFixed(2))
}

function normalizeExperienceLevel(level?: string) {
  const normalized = normalizeText(level ?? "")

  if (/\b(junior|entry|0\s*-\s*2|fresher|associate)\b/.test(normalized)) {
    return "junior"
  }

  if (/\b(senior|lead|principal|staff|architect|8\+|10\+)\b/.test(normalized)) {
    return "senior"
  }

  return "mid"
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
  const markers = [
    "because",
    "so that",
    "for example",
    "for instance",
    "first",
    "then",
    "after",
    "trade off",
    "trade-off",
    "decided",
    "measured",
  ]

  return markers.filter((marker) => normalized.includes(marker))
}

function detectSuspicionMarkers(answer: string) {
  const normalized = normalizeText(answer)
  const markers = [
    "honestly",
    "basically",
    "trust me",
    "obviously",
    "as i said",
    "i already told",
    "not sure",
    "maybe",
    "kind of",
  ]

  return markers.filter((marker) => normalized.includes(marker))
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
  skillType?: SkillType
  fraudScore?: number
  experienceLevel?: string
  roleConfidence?: number
  adaptiveMode?: boolean
}): ResponseAnalysis {
  const answer = params.answer ?? ""
  const normalized = normalizeText(answer)
  const words = normalized ? normalized.split(" ").filter(Boolean) : []
  const signalFlags: string[] = []

  const clarityBase =
    words.length >= 80
      ? 0.92
      : words.length >= 45
        ? 0.78
        : words.length >= 24
          ? 0.62
          : words.length >= 12
            ? 0.44
            : 0.24
  const fillerPenalty = VAGUE_MARKERS.filter((marker) => normalized.includes(marker)).length * 0.08
  const clarityScore = clampScore(clarityBase - fillerPenalty)
  if (clarityScore < 0.5) {
    signalFlags.push("low_clarity")
  }

  const depthMarkers = detectDepthMarkers(answer)
  const depthScore = clampScore(
    (words.length >= 120
      ? 0.8
      : words.length >= 60
        ? 0.62
        : words.length >= 30
          ? 0.42
          : 0.2) + Math.min(0.25, depthMarkers.length * 0.06)
  )
  if (depthScore < 0.5) {
    signalFlags.push("low_depth")
  }

  const confidenceBoost = STRONG_MARKERS.filter((marker) => normalized.includes(marker)).length * 0.06
  const confidenceScore = clampScore(
    clarityScore * 0.45 +
      depthScore * 0.35 +
      Math.min(0.2, confidenceBoost + (normalized.includes("i ") ? 0.08 : 0)) -
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
    params.adaptiveMode
      ? (params.roleConfidence ?? 0.35) * 0.7 + (depthScore + clarityScore) * 0.15
      : Math.max(params.roleConfidence ?? 0.65, 0.65)
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
