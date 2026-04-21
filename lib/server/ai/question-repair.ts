import { normalizeSkillName, presentSkillName } from "@/lib/server/ai/skills"

export type RepairQuestionInput = {
  question_text: string
  intent?: string
  skill?: string
}

export type RepairQuestionOutput = {
  original: string
  repaired: string
  improvements: string[]
  confidence: number
}

const STARTERS = [
  "How do you",
  "What would you do if",
  "Tell me about",
  "How would you approach",
  "Walk me through",
]

const FILLER_PHRASES = [
  "at first still matters",
  "cannot be ignored",
  "starts affecting outcomes",
  "is central to the outcome",
  "is a key part of the work",
  "at the same time still matters",
  "when there is incomplete information at first",
]

const NORMALIZATION_MAP: Array<[RegExp, string]> = [
  [/\bwhen there is incomplete information at first\b/gi, "when data is incomplete"],
  [/\bat first\b/gi, ""],
  [/\bstarts affecting outcomes\b/gi, "creates issues"],
  [/\bis central to the outcome\b/gi, "matters in the role"],
  [/\bis a key part of the work\b/gi, "matters in the role"],
  [/\bthings\b/gi, "the process"],
  [/\bstuff\b/gi, "the work"],
  [/[·•_]+/g, " "],
  [/\s{2,}/g, " "],
]

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function cleanText(value: string) {
  let next = value
  for (const [pattern, replacement] of NORMALIZATION_MAP) {
    next = next.replace(pattern, replacement)
  }
  for (const filler of FILLER_PHRASES) {
    next = next.replace(new RegExp(filler.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "")
  }
  return normalizeWhitespace(next)
}

function simplifyClauses(value: string) {
  const parts = value
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)

  return normalizeWhitespace(parts.slice(0, 2).join(", "))
}

function sentenceCase(value: string) {
  if (!value) {
    return value
  }
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function ensureStarter(text: string, intent?: string, skill?: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    const displaySkill = skill ? presentSkillName(skill) : "this area of work"
    return `How would you approach ${displaySkill}?`
  }

  if (STARTERS.some((starter) => trimmed.toLowerCase().startsWith(starter.toLowerCase()))) {
    return trimmed
  }

  const displaySkill = skill ? presentSkillName(skill) : "this"
  const normalizedIntent = (intent ?? "").toUpperCase()

  if (normalizedIntent.includes("BEHAVIOR")) {
    return `Tell me about ${trimmed.replace(/^[a-z]/, (m) => m.toLowerCase())}`
  }

  if (normalizedIntent.includes("TROUBLE")) {
    return `How do you ${trimmed.replace(/^[a-z]/, (m) => m.toLowerCase())}`
  }

  if (normalizedIntent.includes("EXECUTION") || normalizedIntent.includes("SYSTEM_DESIGN")) {
    return `How would you approach ${trimmed.replace(/^[a-z]/, (m) => m.toLowerCase())}`
  }

  return `How do you handle ${displaySkill} when ${trimmed.replace(/^[a-z]/, (m) => m.toLowerCase())}`
}

function injectMissingContext(text: string, skill?: string) {
  if (!skill) {
    return text
  }

  const displaySkill = presentSkillName(skill)
  const normalizedText = text.toLowerCase()
  const normalizedSkill = normalizeSkillName(skill).replace(/_/g, " ")

  if (normalizedText.includes(normalizedSkill.toLowerCase())) {
    return text
  }

  if (/process|system|database|workflow|schedule|pipeline|service|team|customer/.test(normalizedText)) {
    return text
  }

  return text.replace(/\?$/, ` in ${displaySkill}?`)
}

function enforceQuestionLength(text: string) {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= 25) {
    return text
  }

  return `${words.slice(0, 25).join(" ").replace(/[,.]+$/g, "")}?`
}

function deRepeat(text: string) {
  const normalized = text
    .replace(/\b([a-z]+)\s+\1\b/gi, "$1")
    .replace(/\b(the process)\s+(the process)\b/gi, "$1")
  return normalizeWhitespace(normalized)
}

function finalizeQuestion(text: string) {
  const withoutPunctuation = text.replace(/[.?!]+$/g, "")
  return `${sentenceCase(normalizeWhitespace(withoutPunctuation))}?`
}

function computeConfidence(improvements: string[], original: string, repaired: string) {
  let score = 0.78
  if (improvements.includes("grammar_fixed")) {
    score -= 0.05
  }
  if (improvements.includes("jd_leakage_rewritten")) {
    score -= 0.08
  }
  if (original.trim().toLowerCase() === repaired.trim().toLowerCase()) {
    score += 0.06
  }
  return Math.max(0.45, Math.min(0.98, Number(score.toFixed(2))))
}

export function repairQuestionText(input: RepairQuestionInput): RepairQuestionOutput {
  const original = input.question_text ?? ""
  const improvements = new Set<string>()

  let repaired = cleanText(original)
  if (repaired !== original) {
    improvements.add("grammar_fixed")
  }

  const simplified = simplifyClauses(repaired)
  if (simplified !== repaired) {
    repaired = simplified
    improvements.add("simplified")
  }

  const beforeStarter = repaired
  repaired = ensureStarter(repaired, input.intent, input.skill)
  if (repaired !== beforeStarter) {
    improvements.add("clarity_improved")
  }

  const beforeContext = repaired
  repaired = injectMissingContext(repaired, input.skill)
  if (repaired !== beforeContext) {
    improvements.add("context_added")
  }

  const beforeRepeat = repaired
  repaired = deRepeat(repaired)
  if (repaired !== beforeRepeat) {
    improvements.add("repetition_removed")
  }

  const beforeLength = repaired
  repaired = enforceQuestionLength(repaired)
  if (repaired !== beforeLength) {
    improvements.add("simplified")
  }

  const beforeFinal = repaired
  repaired = finalizeQuestion(repaired)
  if (repaired !== beforeFinal) {
    improvements.add("grammar_fixed")
  }

  if (/(award|awarded|employee of the month|worked as|from .* to)/i.test(original)) {
    improvements.add("jd_leakage_rewritten")
  }

  return {
    original,
    repaired,
    improvements: Array.from(improvements),
    confidence: computeConfidence(Array.from(improvements), original, repaired),
  }
}

export async function repairQuestionsBatch(inputs: RepairQuestionInput[]): Promise<RepairQuestionOutput[]> {
  return inputs.map(repairQuestionText)
}

