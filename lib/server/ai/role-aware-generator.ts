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

  const duration = input.interviewDurationMinutes ?? 30
  let targetCount = 7
  if (duration >= 60) targetCount = 12
  else if (duration >= 45) targetCount = 10

  const prompt = `
You are a senior interviewer across ALL job domains.

Your task is to generate DOMAIN-AWARE, ROLE-SPECIFIC interview questions.

---

INPUT:
- job_description: ${input.jobDescription || "Not provided"}
- resume: ${input.candidateResumeText || "Not provided"}

---

STEP 1: DETECT ROLE FAMILY

Classify into one:
- technical
- sales
- operations
- hr
- finance
- marketing
- customer_success
- general_business

---

STEP 2: EXTRACT CORE SKILLS (5–6)

Rules:
- Only real skills/tools/processes
- Max 3 words per skill
- No sentences
- No JD copy

Examples:
technical → SQL, APIs, Databricks  
sales → CRM, pipeline, negotiation  
hr → onboarding, compliance, employee relations  
finance → financial modeling, forecasting, reporting  
operations → scheduling, workflow, logistics  

---

STEP 3: GENERATE QUESTIONS (STRICT)

Generate exactly ${targetCount} questions.

Rules:

1. Each question:
   - ONE skill only
   - Max 14–16 words
   - Must be answerable

2. DO NOT:
   - copy JD text
   - include long phrases
   - include multiple skills
   - include resume sentences

3. NO prefixes:
   ❌ "You highlighted"
   ❌ "Your background includes"
   ❌ "When working on"

4. Allowed formats ONLY:
   - How do you...
   - How would you...
   - What would you do if...
   - Walk me through...

---

STEP 4: DOMAIN ADAPTATION

Adjust question style based on role:

technical:
- system design, troubleshooting, optimization

sales:
- pipeline management, closing strategy, objections

hr:
- conflict handling, compliance decisions, stakeholder communication

finance:
- analysis, forecasting, risk decisions

operations:
- execution, scheduling, coordination

marketing:
- campaigns, growth, analytics

customer_success:
- retention, escalation, onboarding

---

STEP 5: SELF-VALIDATE

Reject question if:
- longer than 16 words
- contains comma-separated list
- contains JD phrases
- generic like "in this role"
- no skill present

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

