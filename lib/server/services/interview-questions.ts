import { Prisma } from "@prisma/client"

import { validateQuestionStrict } from "@/lib/question-validator"
import { prisma } from "@/lib/server/prisma"
import { InterviewQuestion } from "@/lib/server/ai/interview-flow"

type ColumnInfo = {
  column_name: string
  is_nullable: "YES" | "NO"
  column_default: string | null
}

type QuestionColumnMap = {
  interview_id?: string
  question_id?: string | null
  question_text?: string
  question_order?: number
  order?: number
  source_type?: string
  reference_context?: string | null
  is_dynamic?: boolean
  phase?: string
  phase_label?: string
  phase_type?: string
  phase_hint?: string
  difficulty?: number
  difficulty_level?: number
  is_mandatory?: boolean
  allow_follow_up?: boolean
  allow_followups?: boolean
  allow_follow_ups?: boolean
  target_skill?: string
  target_skill_id?: string | null
  question_type?: string
}

const QUESTION_TABLE = "interview_questions"
const MIN_VALID_QUESTIONS = 5
const GENERIC_PATTERNS = [
  /\bhow (do|would) you use\b/i,
  /\bin this role\b/i,
  /\boptimi[sz]e performance\b/i,
  /\btroubleshoot issues\b/i,
  /\bsolve problems\b/i,
]

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

function mentionsSkill(question: string, skill: string) {
  const normalizedQuestion = normalizeText(question)
  const normalizedSkill = normalizeText(skill)
  if (!normalizedQuestion || !normalizedSkill) {
    return false
  }

  if (normalizedQuestion.includes(normalizedSkill)) {
    return true
  }

  const meaningfulTokens = normalizedSkill
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !["and", "for", "the", "with"].includes(token))

  return meaningfulTokens.some((token) => normalizedQuestion.includes(token))
}

function isGenericQuestion(question: string) {
  return GENERIC_PATTERNS.some((pattern) => pattern.test(question))
}

function hasGoodQuestionLength(question: string) {
  const words = normalizeText(question).split(/\s+/).filter(Boolean)
  return words.length >= 10 && words.length <= 26
}

function normalizeQuestionPattern(question: string, skill: string) {
  const normalizedQuestion = normalizeText(question)
  const normalizedSkill = normalizeText(skill)
  return normalizedQuestion
    .replace(new RegExp(`\\b${normalizedSkill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), " skill ")
    .replace(/\b(how do you|how would you|what would you do if|walk me through|what would you check first|tell me about)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

async function repairQuestionsForPersistence(questions: InterviewQuestion[]) {
  return questions.filter((question) => Boolean(question.question?.trim()) && Boolean(question.skill?.trim()))
}

export async function prepareInterviewQuestionsForPersistence(questions: InterviewQuestion[]) {
  return repairQuestionsForPersistence(questions)
}

function cleanQuestionsForSave(questions: InterviewQuestion[]) {
  const cleaned = questions.filter((question) => {
    const text = question.question ?? ""
    return validateQuestionStrict(text).valid
  }).map((question, index) => ({
    ...question,
    question: question.question,
    source_type: "adaptive" as const,
    is_dynamic: true,
    question_type: question.question_type ?? (question.skill_type === "behavioral" ? "behavioral" : "open_ended"),
    allow_followups: question.allow_followups ?? true,
    id: question.id || `q-${index}`,
  }))

  if (cleaned.length < MIN_VALID_QUESTIONS) {
    throw new Error("Rejected: low-quality questions")
  }

  return cleaned
}

function dedupeQuestionsForSave(questions: InterviewQuestion[]) {
  const uniqueQuestions = Array.from(new Set(
    questions.map((question) => (question.question ?? "").trim()).filter(Boolean)
  ))

  return uniqueQuestions.map((questionText, index) => {
    const original = questions.find((question) => (question.question ?? "").trim() === questionText)

    return {
      ...(original ?? questions[index]),
      id: original?.id || `q-${index}`,
      question: questionText,
    }
  })
}

function validateQuestionShield(questions: InterviewQuestion[]) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return { ok: false, reason: "No questions to persist." }
  }

  const seen = new Set<string>()
  const seenAnchorSource = new Set<string>()
  const seenPatterns = new Set<string>()

  for (const question of questions) {
    const text = (question.question ?? "").trim()
    const skill = (question.skill ?? "").trim()
    const source = (question.source_type ?? "job").trim()
    const anchor = (question.reference_context?.anchor ?? question.skill ?? "").trim()

    if (!text || text.length < 12) {
      return { ok: false, reason: "Question text is too short or empty." }
    }
    if (!hasGoodQuestionLength(text)) {
      return { ok: false, reason: "Question text length is outside the allowed range." }
    }

    if (!skill) {
      return { ok: false, reason: "Question skill is missing." }
    }

    const isAdaptive = source === "adaptive"

    if (!isAdaptive && !mentionsSkill(text, skill)) {
      return { ok: false, reason: `Question does not mention skill: ${skill}` }
    }

    if (!isAdaptive && isGenericQuestion(text)) {
      return { ok: false, reason: `Generic question blocked: ${text}` }
    }

    const normalizedText = normalizeText(text)
    if (seen.has(normalizedText)) {
      return { ok: false, reason: "Duplicate question text detected." }
    }
    seen.add(normalizedText)

    const pattern = normalizeQuestionPattern(text, skill)
    if (!isAdaptive && pattern && seenPatterns.has(pattern)) {
      return { ok: false, reason: "Duplicate question pattern detected." }
    }
    if (pattern) {
      seenPatterns.add(pattern)
    }

    const anchorSourceKey = `${normalizeText(source)}:${normalizeText(anchor)}`
    if (anchorSourceKey !== ":" && seenAnchorSource.has(anchorSourceKey)) {
      return { ok: false, reason: "Duplicate source+anchor detected." }
    }
    seenAnchorSource.add(anchorSourceKey)
  }

  return { ok: true as const }
}

async function getQuestionColumns() {
  const columns = await prisma.$queryRaw<ColumnInfo[]>(Prisma.sql`
    select column_name, is_nullable, column_default
    from information_schema.columns
    where table_schema = 'public'
      and table_name = ${QUESTION_TABLE}
  `)

  return columns
}

export async function fetchExistingInterviewQuestions(interviewId: string) {
  try {
    const columns = await getQuestionColumns()
    const columnSet = new Set(columns.map(c => c.column_name))
    
    if (!columnSet.has("question_text")) {
      return []
    }

    const orderBy = columnSet.has("question_order") 
      ? "\"question_order\"" 
      : columnSet.has("order") 
        ? "\"order\"" 
        : "created_at"

    const rows = await prisma.$queryRawUnsafe<{ question_text: string }[]>(`
      select question_text
      from public."${QUESTION_TABLE}"
      where interview_id = $1::uuid
      order by ${orderBy} asc nulls last
    `, interviewId)

    return rows.map((row) => row.question_text).filter(Boolean)
  } catch (error) {
    console.error("Failed to fetch existing interview questions", error)
    return []
  }
}

export async function clearInterviewQuestions(interviewId: string) {
  try {
    await prisma.$executeRawUnsafe(
      `
        delete from public."${QUESTION_TABLE}"
        where interview_id = $1::uuid
      `,
      interviewId
    )

    return true
  } catch (error) {
    console.error("Failed to clear interview questions", error)
    return false
  }
}

export async function verifyInterviewQuestionsPersisted(
  interviewId: string,
  questions: InterviewQuestion[]
) {
  try {
    const preparedQuestions = cleanQuestionsForSave(await repairQuestionsForPersistence(questions))
    const saved = await fetchExistingInterviewQuestions(interviewId)
    if (saved.length === 0 && preparedQuestions.length > 0) {
      return false
    }

    if (saved.length !== preparedQuestions.length) {
      console.warn(`Verification count mismatch: saved ${saved.length}, expected ${preparedQuestions.length}`)
      return saved.length > 0
    }

    const matchCount = preparedQuestions.filter((q, i) => {
      const savedText = normalizeText(saved[i] ?? "")
      const expectedText = normalizeText(q.question ?? "")
      return savedText === expectedText
    }).length
    const matchRate = matchCount / preparedQuestions.length
    
    return matchRate >= 0.8
  } catch (error) {
    console.error("Failed to verify persisted interview questions", error)
    return false
  }
}

function buildColumnValues(question: InterviewQuestion, orderIndex: number): QuestionColumnMap {
  const phaseHint = question.phase_hint ?? "core"
  const questionType = question.question_type ?? (question.skill_type === "behavioral" ? "behavioral" : "open_ended")
  const sourceType = question.source_type === "resume" || question.source_type === "job" || question.source_type === "behavioral" || question.source_type === "adaptive"
    ? question.source_type
    : question.skill_type === "behavioral"
      ? "behavioral"
      : "job"

  return {
    interview_id: undefined,
    question_id: null,
    question_text: question.question,
    question_order: orderIndex,
    order: orderIndex,
    source_type: sourceType,
    reference_context: question.reference_context ? JSON.stringify(question.reference_context) : null,
    is_dynamic: question.is_dynamic ?? true,
    phase: "core",
    phase_label: "core",
    phase_type: "core",
    phase_hint: phaseHint,
    difficulty: 3,
    difficulty_level: 3,
    is_mandatory: true,
    allow_follow_up: question.allow_followups ?? true,
    allow_followups: true,
    allow_follow_ups: true,
    target_skill: question.skill,
    target_skill_id: null,
    question_type: questionType,
  }
}

function buildInsertStatement(
  columns: ColumnInfo[],
  interviewId: string,
  questions: InterviewQuestion[]
) {
  if (questions.length === 0) {
    return null
  }

  const columnSet = new Set(columns.map((col) => col.column_name))
  const required = columns.filter((col) => col.is_nullable === "NO" && col.column_default === null)

  const insertColumns = Array.from(columnSet).filter((name) => {
    if (name === "interview_id" || name === "question_text") {
      return true
    }

    if (name === "question_id") {
      return true
    }

    if (name === "question_order" || name === "order") {
      return true
    }

    if (name === "source_type" || name === "reference_context" || name === "is_dynamic") {
      return true
    }

    if (name === "phase" || name === "phase_label" || name === "phase_type") {
      return true
    }

    if (name === "phase_hint" || name === "question_type") {
      return true
    }

    if (name === "difficulty" || name === "difficulty_level") {
      return true
    }

    if (name === "is_mandatory" || name === "allow_follow_up" || name === "allow_followups" || name === "allow_follow_ups") {
      return true
    }

    if (name === "target_skill" || name === "target_skill_id") {
      return true
    }

    return false
  })

  const missingRequired = required.some((col) => !insertColumns.includes(col.column_name))
  if (missingRequired) {
    console.warn("Interview question insert skipped due to required columns mismatch.")
    return null
  }

  const values: unknown[] = []
  const valueRows: string[] = []

  questions.forEach((question, index) => {
    const rowValues = buildColumnValues(question, index + 1)
    const placeholders: string[] = []

    insertColumns.forEach((column) => {
      let value: unknown = null
      if (column === "interview_id") {
        value = interviewId
      } else {
        value = rowValues[column as keyof QuestionColumnMap]
      }

      values.push(value)
      const placeholderIndex = values.length
      if (column === "interview_id") {
        placeholders.push(`$${placeholderIndex}::uuid`)
      } else if (column === "reference_context") {
        placeholders.push(`$${placeholderIndex}::jsonb`)
      } else if (column === "target_skill_id") {
        placeholders.push(`$${placeholderIndex}::uuid`)
      } else {
        placeholders.push(`$${placeholderIndex}`)
      }
    })

    valueRows.push(`(${placeholders.join(", ")})`)
  })

  const quotedColumns = insertColumns.map((column) => `"${column}"`)
  const sql = `
    insert into public."${QUESTION_TABLE}" (${quotedColumns.join(", ")})
    values ${valueRows.join(", ")}
  `

  return { sql, values }
}

export async function replaceInterviewQuestions(
  interviewId: string,
  questions: InterviewQuestion[]
) {
  try {
    const preparedQuestions = await repairQuestionsForPersistence(questions)
    const cleaned = cleanQuestionsForSave(preparedQuestions)
    const uniqueQuestions = dedupeQuestionsForSave(cleaned)
    const existing = await fetchExistingInterviewQuestions(interviewId)
    const existingSet = new Set(existing.map((questionText) => questionText.trim()))
    const filtered = uniqueQuestions.filter((question) =>
      !existingSet.has((question.question ?? "").trim())
    )

    if (filtered.length < MIN_VALID_QUESTIONS) {
      throw new Error("Rejected: low-quality questions")
    }

    const shield = validateQuestionShield(filtered)
    if (!shield.ok) {
      console.warn("Question shield blocked insert", {
        interviewId,
        reason: shield.reason,
      })
      return false
    }

    const columns = await getQuestionColumns()
    if (columns.length === 0) {
      console.warn("Interview questions table not found; skipping insert.")
      return false
    }

    await clearInterviewQuestions(interviewId)

    const insert = buildInsertStatement(columns, interviewId, filtered)
    if (!insert) {
      return false
    }

    await prisma.$executeRawUnsafe(insert.sql, ...insert.values)
    return true
  } catch (error) {
    console.error("Failed to replace interview questions", error)
    return false
  }
}
