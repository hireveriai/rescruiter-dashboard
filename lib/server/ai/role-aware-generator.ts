import { BaseGenerationInput, InterviewQuestion } from "./interview-flow"
import { mapQuestionToSkill, presentSkillName, classifySkillType } from "./skills"

const OPENAI_MODEL = process.env.OPENAI_QUESTION_MODEL || "gpt-4o-mini"

export type RoleAwareOutput = {
  role_family: string
  skills: string[]
  questions: string[]
}

export async function generateRoleAwareQuestions(
  input: BaseGenerationInput
): Promise<RoleAwareOutput | null> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim().replace(/^"|"$/g, "")
  if (!apiKey) return null

  const prompt = `
Your job is to generate ROLE-AWARE, DOMAIN-SPECIFIC interview questions based ONLY on the job description (JD) and candidate resume.

---

INPUT:
- job_description: ${input.jobDescription || "Not provided"}
- resume: ${input.candidateResumeText || "Not provided"}

---

STEP 1: IDENTIFY ROLE FAMILY

Classify the role into ONE primary domain:

- TECH (Backend, Frontend, Data, DevOps, QA)
- DATA (Data Engineer, Analyst, BI, ML)
- SALES (BD, Account Manager, Inside Sales)
- OPERATIONS (Planner, Scheduler, Supply Chain, Field Ops)
- HR (Recruiter, HRBP, Talent Acquisition)
- FINANCE (Accounts, FP&A, Audit, Payroll)
- MARKETING (Growth, Brand, Performance Marketing)
- CUSTOMER_SUCCESS / SUPPORT

Return:
"role_family": "..."

---

STEP 2: EXTRACT DOMAIN-SPECIFIC SKILLS

Extract 5–8 REAL, ROLE-SPECIFIC skills from JD + resume.

STRICT RULES:
- Skills must be tools / processes / measurable capabilities
- NO generic words like:
  ❌ performance, operations, management, system, work

---

STEP 3: GENERATE QUESTIONS (STRICT)

Generate 6–8 interview questions.

MANDATORY RULES:

1. EVERY question MUST include a domain skill
2. QUESTIONS MUST MATCH ROLE FAMILY
3. NO GENERIC QUESTIONS
4. MUST TEST REAL ABILITY: experience, decision-making, problem-solving
5. LANGUAGE: Max 18 words, one clear idea, natural interviewer tone

---

STEP 4: SELF-VALIDATION

Reject question if:
- No domain keyword
- Too generic
- Repeated intent
- Not evaluatable

---

OUTPUT FORMAT:
Return ONLY a JSON object:
{
  "role_family": "...",
  "skills": ["skill1", "skill2"],
  "questions": [
    "Question 1",
    "Question 2"
  ]
}
`

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You are a senior hiring interviewer across MULTIPLE DOMAINS. You output ONLY JSON.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: prompt,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "role_aware_questions",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                role_family: { type: "string" },
                skills: { type: "array", items: { type: "string" } },
                questions: { type: "array", items: { type: "string" } },
              },
              required: ["role_family", "skills", "questions"],
            },
          },
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("OpenAI Role-Aware generation failed", error)
      return null
    }

    const payload = await response.json()
    const content = extractStructuredOutputText(payload)
    if (content) {
      return JSON.parse(content)
    }
    return null
  } catch (error) {
    console.error("Error generating role-aware questions", error)
    return null
  }
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
  // Merge LLM extracted skills into universe for better mapping
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
  if (f.includes("DATA")) return "technical" // Could be specialized if project had 'data' family
  if (f.includes("SALES")) return "sales"
  if (f.includes("OPERATIONS")) return "operations"
  if (f.includes("HR")) return "hr"
  if (f.includes("FINANCE")) return "finance"
  if (f.includes("MARKETING")) return "marketing"
  if (f.includes("CUSTOMER_SUCCESS") || f.includes("SUPPORT")) return "customer_success"
  return family.toLowerCase()
}

