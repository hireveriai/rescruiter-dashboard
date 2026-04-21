import { normalizeSkillName, presentSkillName } from "@/lib/server/ai/skills"

export type RepairQuestionInput = {
  question_text: string
  intent?: string
  skill?: string
}

export type RepairQuestionOutput = {
  original: string
  repaired: string | null
  changed: boolean
  rejected?: boolean
  reason?: string
}

const STRONG_STARTERS = [
  "How do you",
  "How would you",
  "What would you do if",
]

const BROKEN_PHRASES = [
  "cannot be compromised",
  "still matters",
  "starts affecting outcomes",
  "is central to the outcome",
  "is a key part of the work",
  "at first",
]

const NORMALIZATION_RULES: Array<[RegExp, string]> = [
  [/[Â·â€¢_]+/g, " "],
  [/\bwhen there is incomplete information\b/gi, "when data is incomplete"],
  [/\bexecute database\b/gi, "work on the database"],
  [/\bexecute sql\b/gi, "work on SQL"],
  [/\bthings\b/gi, "the process"],
  [/\bstuff\b/gi, "the work"],
  [/\boutcomes\b/gi, "results"],
  [/\s{2,}/g, " "],
]

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function cleanRawText(value: string) {
  let next = value ?? ""
  for (const [pattern, replacement] of NORMALIZATION_RULES) {
    next = next.replace(pattern, replacement)
  }
  for (const phrase of BROKEN_PHRASES) {
    next = next.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "")
  }
  return normalizeWhitespace(next)
}

function wordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length
}

function sentenceCase(value: string) {
  if (!value) {
    return value
  }
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function looksMeaningless(text: string) {
  const normalized = text.toLowerCase()
  if (!normalized || wordCount(normalized) < 4) {
    return true
  }

  const badSignals = [
    /employee of the month/i,
    /worked as/i,
    /from .* to/i,
    /\baug\b|\bfeb\b|\bmar\b|\bapr\b|\bmay\b|\bjun\b|\bjul\b|\bsep\b|\boct\b|\bnov\b|\bdec\b/i,
  ]

  const signalHits = badSignals.filter((pattern) => pattern.test(text)).length
  return signalHits >= 2
}

function inferStarter(intent?: string) {
  const normalized = (intent ?? "").toUpperCase()
  if (normalized.includes("BEHAV")) {
    return "How do you"
  }
  if (normalized.includes("TROUBLE")) {
    return "What would you do if"
  }
  if (normalized.includes("SYSTEM") || normalized.includes("DESIGN")) {
    return "How would you"
  }
  if (normalized.includes("OPTIM")) {
    return "How do you"
  }
  if (normalized.includes("ANAL")) {
    return "How do you"
  }
  return STRONG_STARTERS[0]
}

function inferContextNoun(skill?: string, text?: string) {
  const displaySkill = skill ? presentSkillName(skill) : ""
  const normalizedSkill = normalizeSkillName(skill ?? "").replace(/_/g, " ")
  const normalizedText = (text ?? "").toLowerCase()

  if (/database|sql|query|postgres|mysql/.test(normalizedSkill) || /database|sql|query|postgres|mysql/.test(normalizedText)) {
    return displaySkill || "the database"
  }
  if (/schedule|dispatch|allocation|resource|capacity/.test(normalizedSkill) || /schedule|dispatch|allocation|resource|capacity/.test(normalizedText)) {
    return displaySkill || "the schedule"
  }
  if (/customer|service|support|sla/.test(normalizedSkill) || /customer|service|support|sla/.test(normalizedText)) {
    return displaySkill || "the service process"
  }
  if (/pipeline|etl|data/.test(normalizedSkill) || /pipeline|etl|data/.test(normalizedText)) {
    return displaySkill || "the data pipeline"
  }
  if (/team|stakeholder|coordination|communication/.test(normalizedSkill) || /team|stakeholder|coordination|communication/.test(normalizedText)) {
    return displaySkill || "the workflow"
  }

  return displaySkill || "the process"
}

function inferSituation(text: string, skill?: string, intent?: string) {
  const normalized = text.toLowerCase()
  const context = inferContextNoun(skill, text)

  if (/priority|competing|window|urgent/.test(normalized)) {
    return `priorities suddenly conflict in ${context}`
  }
  if (/monitor|alert|signal|metric/.test(normalized)) {
    return `${context} shows warning signs`
  }
  if (/latency|performance|slow/.test(normalized)) {
    return `${context} starts slowing down`
  }
  if (/security|risk|compliance/.test(normalized)) {
    return `${context} raises a risk concern`
  }
  if (/handoff|team|stakeholder|communication/.test(normalized)) {
    return `coordination breaks down around ${context}`
  }
  if (/incomplete information|data is incomplete|mixed signal/.test(normalized)) {
    return `data is incomplete around ${context}`
  }

  const normalizedIntent = (intent ?? "").toUpperCase()
  if (normalizedIntent.includes("TROUBLE")) {
    return `${context} starts going off track`
  }
  if (normalizedIntent.includes("BEHAV")) {
    return `${context} comes under pressure`
  }

  return `${context} needs closer attention`
}

function buildRewrite(input: RepairQuestionInput) {
  const cleaned = cleanRawText(input.question_text)
  const starter = inferStarter(input.intent)
  const context = inferContextNoun(input.skill, cleaned)
  const situation = inferSituation(cleaned, input.skill, input.intent)

  if (starter === "What would you do if") {
    return `${starter} ${situation}?`
  }

  if (starter === "How would you") {
    return `${starter} approach ${context} when ${situation.replace(new RegExp(`^${context}\\s*`, "i"), "").trim()}?`
  }

  return `${starter} handle ${situation}?`
}

function compressToLength(text: string) {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= 18) {
    return text
  }

  return `${words.slice(0, 18).join(" ").replace(/[,.]+$/g, "")}?`
}

function finalizeQuestion(text: string) {
  const trimmed = normalizeWhitespace(text).replace(/[.?!]+$/g, "")
  return `${sentenceCase(trimmed)}?`
}

export function repairQuestionText(input: RepairQuestionInput): RepairQuestionOutput {
  const original = input.question_text ?? ""
  const cleaned = cleanRawText(original)

  if (looksMeaningless(cleaned)) {
    return {
      original,
      repaired: null,
      changed: false,
      rejected: true,
      reason: "Meaning is too unclear to rewrite confidently",
    }
  }

  let repaired = buildRewrite(input)
  repaired = compressToLength(repaired)
  repaired = finalizeQuestion(repaired)

  if (wordCount(repaired) < 4 || wordCount(repaired) > 18) {
    return {
      original,
      repaired: null,
      changed: false,
      rejected: true,
      reason: "Question could not be rewritten into a clear short form",
    }
  }

  return {
    original,
    repaired,
    changed: normalizeWhitespace(original).toLowerCase() !== normalizeWhitespace(repaired).toLowerCase(),
  }
}

export async function repairQuestionsBatch(inputs: RepairQuestionInput[]): Promise<RepairQuestionOutput[]> {
  return inputs.map(repairQuestionText)
}

