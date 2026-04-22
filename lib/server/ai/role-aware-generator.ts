import { BaseGenerationInput, InterviewQuestion } from "./interview-flow"
import { mapQuestionToSkill, classifySkillType } from "./skills"
import { validateQuestionStrict } from "./question-validator"

const MODEL = process.env.OPENAI_QUESTION_MODEL || "gpt-4o-mini"

export type RoleAwareOutput = {
  role_family: string
  skills: string[]
  questions: string[]
}

async function callLLM(prompt: string) {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim().replace(/^"|"$/g, "")
  if (!apiKey) {
    throw new Error("Missing OpenAI API key")
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      input: prompt,
    }),
  })

  if (!res.ok) {
    const message = await res.text()
    throw new Error(`OpenAI request failed: ${res.status} ${message}`)
  }

  const data = await res.json()
  return extractStructuredOutputText(data) || data.output_text || ""
}

export async function generateRoleAwareQuestions(
  input: {
    jobDescription?: string
    candidateResumeText?: string
  } & BaseGenerationInput
): Promise<RoleAwareOutput | null> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim().replace(/^"|"$/g, "")
  if (!apiKey) {
    return null
  }

  const basePrompt = `
You are a senior interviewer across ALL job domains.

INPUT:

JOB DESCRIPTION:
${input.jobDescription || "N/A"}

RESUME:
${input.candidateResumeText || "N/A"}

TASK:

1. Detect role family
2. Extract 5–6 skills
3. Generate EXACTLY 7 questions

STRICT RULES:

- ONE skill per question
- MAX 15 words
- NO commas
- NO resume references
- NO JD copy
- NO phrases like "you highlighted"

ALLOWED FORMAT:
- How do you...
- What would you do if...
- Walk me through...

OUTPUT JSON ONLY:

{
  "role_family": "...",
  "skills": ["..."],
  "questions": ["..."]
}
`

  try {
    return await generateWithRetry(basePrompt)
  } catch (error) {
    console.error("Error generating role-aware questions", error)
    return null
  }
}

async function generateWithRetry(prompt: string, maxRetries = 3): Promise<RoleAwareOutput> {
  let currentPrompt = prompt

  for (let i = 0; i < maxRetries; i += 1) {
    const raw = await callLLM(currentPrompt)

    let parsed: RoleAwareOutput | null = null
    try {
      parsed = JSON.parse(raw) as RoleAwareOutput
    } catch {
      continue
    }

    const valid: string[] = []
    const errors: string[] = []

    for (const q of parsed.questions || []) {
      const v = validateQuestionStrict(q)
      if (v.valid) {
        valid.push(q)
      } else {
        errors.push(v.reason || "invalid")
      }
    }

    if (valid.length >= 5) {
      return {
        role_family: parsed.role_family,
        skills: parsed.skills,
        questions: valid.slice(0, 7),
      }
    }

    const errorSummary = [...new Set(errors)].join(", ")

    currentPrompt = `
${prompt}

FIX ERRORS:

${errorSummary}

RULES AGAIN:
- Max 15 words
- No commas
- No JD copy
- No resume references

Regenerate clean output.
`
  }

  throw new Error("Failed to generate valid questions")
}

function extractStructuredOutputText(response: any) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim()
  }

  const textChunks = (response.output ?? [])
    .flatMap((item: any) => item.content ?? [])
    .filter((item: any) => item.type === "output_text" || item.type === "text")
    .map((item: any) => item.text ?? "")
    .join("")
    .trim()

  return textChunks
}

export function mapRoleAwareToInterviewQuestions(
  output: RoleAwareOutput,
  skillUniverse: string[]
): InterviewQuestion[] {
  const extendedUniverse = Array.from(new Set([...skillUniverse, ...output.skills]))

  return output.questions.map((q, index) => {
    const mapping = mapQuestionToSkill(q, extendedUniverse)
    return {
      id: `ra-${index}-${Date.now()}`,
      question: q,
      skill: mapping.skill || "general",
      skill_type: classifySkillType(mapping.skill) || "functional",
      source_type: "adaptive" as const,
    }
  })
}

export function normalizeRoleFamily(family: string): string {
  const f = family.toUpperCase().trim()
  if (f.includes("TECH")) return "technical"
  if (f.includes("DATA")) return "technical"
  if (f.includes("SALES")) return "sales"
  if (f.includes("OPERATIONS")) return "operations"
  if (f.includes("HR")) return "hr"
  if (f.includes("FINANCE")) return "finance"
  if (f.includes("MARKETING")) return "marketing"
  if (f.includes("CUSTOMER_SUCCESS") || f.includes("SUPPORT")) return "customer_success"
  return family.toLowerCase()
}
