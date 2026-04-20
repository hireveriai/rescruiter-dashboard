import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"
import { InterviewQuestion } from "@/lib/server/ai/interview-flow"

type ColumnInfo = {
  column_name: string
  is_nullable: "YES" | "NO"
  column_default: string | null
}

type QuestionColumnMap = {
  interview_id?: string
  question_text?: string
  question_order?: number
  order?: number
  phase?: string
  phase_label?: string
  phase_type?: string
  difficulty?: number
  difficulty_level?: number
  is_mandatory?: boolean
  allow_followups?: boolean
  target_skill?: string
  target_skill_id?: string | null
}

const QUESTION_TABLE = "interview_questions"

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
    const hasQuestionText = columns.some((col) => col.column_name === "question_text")
    if (!hasQuestionText) {
      return []
    }

    const rows = await prisma.$queryRaw<{ question_text: string }[]>(Prisma.sql`
      select question_text
      from public.${Prisma.raw(QUESTION_TABLE)}
      where interview_id = ${interviewId}::uuid
      order by created_at asc nulls last
    `)

    return rows.map((row) => row.question_text).filter(Boolean)
  } catch (error) {
    console.error("Failed to fetch existing interview questions", error)
    return []
  }
}

export async function verifyInterviewQuestionsPersisted(
  interviewId: string,
  questions: InterviewQuestion[]
) {
  try {
    const saved = await fetchExistingInterviewQuestions(interviewId)
    if (saved.length !== questions.length) {
      return false
    }

    return questions.every((question, index) => (saved[index] ?? "").trim() === question.question.trim())
  } catch (error) {
    console.error("Failed to verify persisted interview questions", error)
    return false
  }
}

function buildColumnValues(question: InterviewQuestion, orderIndex: number): QuestionColumnMap {
  return {
    interview_id: undefined,
    question_text: question.question,
    question_order: orderIndex,
    order: orderIndex,
    phase: "core",
    phase_label: "core",
    phase_type: "core",
    difficulty: 3,
    difficulty_level: 3,
    is_mandatory: true,
    allow_followups: true,
    target_skill: question.skill,
    target_skill_id: null,
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

    if (name === "question_order" || name === "order") {
      return true
    }

    if (name === "phase" || name === "phase_label" || name === "phase_type") {
      return true
    }

    if (name === "difficulty" || name === "difficulty_level") {
      return true
    }

    if (name === "is_mandatory" || name === "allow_followups") {
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
    const columns = await getQuestionColumns()
    if (columns.length === 0) {
      console.warn("Interview questions table not found; skipping insert.")
      return false
    }

    await prisma.$executeRaw(Prisma.sql`
      delete from public.${Prisma.raw(QUESTION_TABLE)}
      where interview_id = ${interviewId}::uuid
    `)

    const insert = buildInsertStatement(columns, interviewId, questions)
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
