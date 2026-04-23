import { BaseGenerationInput, InterviewQuestion } from "./interview-flow"
import { mapQuestionToSkill, classifySkillType, deriveSkillsFromText, sanitizeSkillList } from "./skills"
import { validateQuestionStrict } from "./question-validator"

const MODEL = process.env.OPENAI_QUESTION_MODEL || "gpt-4o-mini"

export type RoleAwareOutput = {
  role_family: string
  skills: string[]
  questions: string[]
  question_skills?: string[]
  question_sources?: Array<"job" | "resume">
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
  console.log("🔥 NEW GENERATOR ACTIVE")
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim().replace(/^"|"$/g, "")
  if (!apiKey) {
    return null
  }
  const uniqueSalt = Date.now()
  const jobSkills = Array.from(new Set([
    ...sanitizeSkillList(input.coreSkills ?? [], {
      jobTitle: input.jobTitle,
      jobDescription: input.jobDescription,
    }),
    ...deriveSkillsFromText(input.jobDescription),
  ])).slice(0, 12)
  const resumeSkills = Array.from(new Set([
    ...sanitizeSkillList(input.candidateResumeSkills ?? [], {
      jobTitle: input.jobTitle,
      jobDescription: input.jobDescription,
    }),
    ...deriveSkillsFromText(input.candidateResumeText),
  ])).slice(0, 12)
  const desiredTotal = Math.max(5, Math.min(10, Number(input.totalQuestions ?? 7) || 7))
  const resumeTarget = resumeSkills.length > 0
    ? Math.min(2, Math.max(1, Math.round(desiredTotal * 0.3)), resumeSkills.length)
    : 0
  const jobTarget = desiredTotal - resumeTarget

  const basePrompt = `
You are a senior interviewer across ALL job domains.

UNIQUE RUN ID: ${uniqueSalt}

INPUT:

JOB DESCRIPTION:
${input.jobDescription || "N/A"}

RESUME:
${input.candidateResumeText || "N/A"}

JOB SKILLS:
${jobSkills.length > 0 ? jobSkills.join(", ") : "N/A"}

RESUME SKILLS:
${resumeSkills.length > 0 ? resumeSkills.join(", ") : "N/A"}

TASK:

1. Detect role family
2. Generate EXACTLY ${desiredTotal} questions
3. Use EXACTLY ${jobTarget} job-anchored questions and EXACTLY ${resumeTarget} resume-anchored questions

STRICT RULES:

- ONE skill per question
- MAX 15 words
- NO commas
- NO resume references
- NO JD copy
- NO phrases like "you highlighted"
- Do NOT repeat previous question patterns
- Generate fresh variations
- Each question must be tied to ONE real-world scenario
- Include light context such as failure, scale, pressure, ambiguity, or constraints
- Add context naturally without copying sentences from the JD or resume
- Job-anchored questions must come from JOB SKILLS
- Resume-anchored questions must come from RESUME SKILLS
- Resume questions must test candidate-owned experience, not copy resume text
- Keep question_skills and question_sources aligned 1:1 with questions

ALLOWED FORMAT:
- How do you...
- What would you do if...
- Walk me through...

OUTPUT JSON ONLY:

{
  "role_family": "...",
  "skills": ["..."],
  "questions": ["..."],
  "question_skills": ["..."],
  "question_sources": ["job", "job", "resume"]
}
`

  try {
    return await generateWithRetry(basePrompt, {
      desiredTotal,
      jobTarget,
      resumeTarget,
    })
  } catch (error) {
    console.error("Error generating role-aware questions", error)
    return null
  }
}

async function generateWithRetry(
  prompt: string,
  targets: {
    desiredTotal: number
    jobTarget: number
    resumeTarget: number
  },
  maxRetries = 3
): Promise<RoleAwareOutput> {
  let currentPrompt = prompt

  for (let i = 0; i < maxRetries; i += 1) {
    const raw = await callLLM(currentPrompt)

    let parsed: RoleAwareOutput | null = null
    try {
      parsed = JSON.parse(raw) as RoleAwareOutput
    } catch {
      continue
    }

    const validQuestions: string[] = []
    const validSkills: string[] = []
    const validSources: Array<"job" | "resume"> = []
    const errors: string[] = []
    const parsedSkills = Array.isArray(parsed.question_skills) ? parsed.question_skills : []
    const parsedSources = Array.isArray(parsed.question_sources) ? parsed.question_sources : []

    for (let index = 0; index < (parsed.questions || []).length; index += 1) {
      const q = parsed.questions[index]
      const v = validateQuestionStrict(q)
      if (v.valid) {
        validQuestions.push(q)
        validSkills.push(
          typeof parsedSkills[index] === "string"
            ? parsedSkills[index]
            : parsed.skills?.[index % Math.max(parsed.skills?.length ?? 1, 1)] ?? "general"
        )
        validSources.push(parsedSources[index] === "resume" ? "resume" : "job")
      } else {
        errors.push(v.reason || "invalid")
      }
    }

    const jobCount = validSources.filter((source) => source === "job").length
    const resumeCount = validSources.filter((source) => source === "resume").length

    if (validQuestions.length >= 5 && jobCount >= targets.jobTarget && resumeCount >= targets.resumeTarget) {
      return {
        role_family: parsed.role_family,
        skills: parsed.skills,
        questions: validQuestions.slice(0, targets.desiredTotal),
        question_skills: validSkills.slice(0, targets.desiredTotal),
        question_sources: validSources.slice(0, targets.desiredTotal),
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
- Add one light real-world constraint or operating context per question
- Use failure, scale, pressure, ambiguity, or time constraints when relevant

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
