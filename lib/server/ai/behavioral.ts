export type RoleType = "TECHNICAL" | "NON_TECHNICAL" | "HYBRID"

export type QuestionPhase = "WARMUP" | "MID" | "PROBE" | "WRAP"

export type Question = {
  id: string
  text: string
  phase: QuestionPhase
  tags: string[]
  type: "BEHAVIORAL" | "TECHNICAL" | "SYSTEM" | "GENERAL"
  skill?: string
  skillBucket?: string
}

type BehavioralMix = {
  targetPercent: number
  minPercent: number
  maxPercent: number
}

const ROLE_BEHAVIORAL_MIX: Record<RoleType, BehavioralMix> = {
  TECHNICAL: { targetPercent: 20, minPercent: 15, maxPercent: 25 },
  NON_TECHNICAL: { targetPercent: 45, minPercent: 40, maxPercent: 50 },
  HYBRID: { targetPercent: 30, minPercent: 30, maxPercent: 30 },
}

function clampPercent(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getBehavioralCount(total: number, roleType: RoleType) {
  const mix = ROLE_BEHAVIORAL_MIX[roleType]
  const raw = Math.round((total * mix.targetPercent) / 100)
  const min = Math.ceil((total * mix.minPercent) / 100)
  const max = Math.floor((total * mix.maxPercent) / 100)
  return clampPercent(raw, min, max)
}

function insertBehavioralMidFlow(
  baseQuestions: Question[],
  behavioralQuestions: Question[]
): Question[] {
  if (behavioralQuestions.length === 0) {
    return baseQuestions
  }

  const withPhases = baseQuestions.map((q, index) => ({
    ...q,
    phase: q.phase || (index < 2 ? "WARMUP" : "MID"),
  }))

  const midIndex = Math.max(2, Math.floor(withPhases.length / 2))
  const merged = [...withPhases]

  behavioralQuestions.forEach((question, idx) => {
    const insertAt = Math.min(midIndex + idx, merged.length)
    merged.splice(insertAt, 0, { ...question, phase: "MID", type: "BEHAVIORAL" })
  })

  return merged
}

export function enforceBehavioralQuestions(params: {
  roleType: RoleType
  baseQuestions: Question[]
  behavioralBank: Question[]
}): Question[] {
  const { roleType, baseQuestions, behavioralBank } = params
  const behavioralCount = getBehavioralCount(baseQuestions.length, roleType)

  const selectedBehavioral: Question[] = behavioralBank.slice(0, behavioralCount).map((item, index): Question => ({
    ...item,
    id: item.id || `behavioral-${index}`,
    phase: "MID",
    type: "BEHAVIORAL",
  }))

  return insertBehavioralMidFlow(baseQuestions, selectedBehavioral)
}
