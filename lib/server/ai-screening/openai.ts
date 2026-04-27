import { sanitizeSkillList } from "@/lib/server/ai/skills"
import type { ParsedResume } from "@/lib/server/resumeParser"

export type ParsedJobDescription = {
  roleTitle: string | null
  requiredSkills: string[]
  experienceNeeded: number | null
  seniority: "JUNIOR" | "MID" | "SENIOR" | null
  summary: string
}

export type CandidateMatchResult = {
  matchScore: number
  skillMatch: number
  experienceMatch: number
  missingSkills: string[]
  riskLevel: "LOW" | "MEDIUM" | "HIGH"
  recommendation: "STRONG_FIT" | "POTENTIAL" | "WEAK" | "REJECT"
  shortReasoning: string
}

type OpenAIResponsesOutputText = {
  output_text?: string
  output?: Array<{
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
}

const DEFAULT_MODEL = "gpt-4o-mini"

function getOpenAIModel() {
  return process.env.OPENAI_SCREENING_MODEL?.trim() || DEFAULT_MODEL
}

function extractStructuredOutputText(response: OpenAIResponsesOutputText) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim()
  }

  const textChunks = (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" || item.type === "text")
    .map((item) => item.text ?? "")
    .join("")
    .trim()

  return textChunks || null
}

function clampScore(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value)

  if (!Number.isFinite(numberValue)) {
    return 0
  }

  return Math.min(100, Math.max(0, Math.round(numberValue)))
}

async function callOpenAIJson<T>(input: {
  system: string
  user: string
  schemaName: string
  schema: Record<string, unknown>
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim().replace(/^"|"$/g, "")

  if (!apiKey) {
    return null
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: input.system }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: input.user }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: input.schema,
        },
      },
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`)
  }

  const payload = (await response.json()) as OpenAIResponsesOutputText
  const outputText = extractStructuredOutputText(payload)

  if (!outputText) {
    throw new Error("OpenAI returned empty output")
  }

  return JSON.parse(outputText) as T
}

function extractExperienceNeeded(text: string) {
  const patterns = [
    /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+experience/i,
    /experience\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i,
    /minimum\s+(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) {
      const parsed = Number.parseFloat(match[1])
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }

  return null
}

function inferSeniority(experienceNeeded: number | null): ParsedJobDescription["seniority"] {
  if (experienceNeeded === null) {
    return null
  }

  if (experienceNeeded <= 1.5) {
    return "JUNIOR"
  }

  if (experienceNeeded >= 6) {
    return "SENIOR"
  }

  return "MID"
}

function fallbackParseJobDescription(description: string, titleHint?: string | null): ParsedJobDescription {
  const trimmed = description.trim()
  const firstLine = trimmed.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
  const experienceNeeded = extractExperienceNeeded(trimmed)
  const requiredSkills = sanitizeSkillList([], {
    jobTitle: titleHint ?? firstLine ?? undefined,
    jobDescription: trimmed,
  }).slice(0, 24)

  return {
    roleTitle: titleHint?.trim() || firstLine?.replace(/^role\s*[:\-]\s*/i, "") || "Untitled Role",
    requiredSkills,
    experienceNeeded,
    seniority: inferSeniority(experienceNeeded),
    summary: trimmed.slice(0, 700),
  }
}

function normalizeParsedJobDescription(
  parsed: ParsedJobDescription,
  description: string,
  titleHint?: string | null
): ParsedJobDescription {
  const fallback = fallbackParseJobDescription(description, titleHint)
  const experienceNeeded =
    typeof parsed.experienceNeeded === "number" && Number.isFinite(parsed.experienceNeeded)
      ? parsed.experienceNeeded
      : fallback.experienceNeeded
  const requiredSkills = sanitizeSkillList(
    Array.isArray(parsed.requiredSkills) ? parsed.requiredSkills : fallback.requiredSkills,
    {
      jobTitle: parsed.roleTitle ?? titleHint ?? undefined,
      jobDescription: description,
    }
  ).slice(0, 30)

  return {
    roleTitle: parsed.roleTitle?.trim() || fallback.roleTitle,
    requiredSkills,
    experienceNeeded,
    seniority:
      parsed.seniority === "JUNIOR" || parsed.seniority === "MID" || parsed.seniority === "SENIOR"
        ? parsed.seniority
        : inferSeniority(experienceNeeded),
    summary: parsed.summary?.trim() || fallback.summary,
  }
}

export async function parseJobDescriptionWithAI(description: string, titleHint?: string | null) {
  const fallback = fallbackParseJobDescription(description, titleHint)
  const trimmedDescription = description.trim()

  if (!trimmedDescription || !process.env.OPENAI_API_KEY) {
    return fallback
  }

  try {
    const parsed = await callOpenAIJson<ParsedJobDescription>({
      schemaName: "job_description_parser",
      system:
        "Extract structured hiring requirements from a job description. Return only JSON matching the schema.",
      user: [
        "Extract these fields from the job description:",
        "- Required skills",
        "- Experience needed",
        "- Role title",
        "",
        `Title hint: ${titleHint || "N/A"}`,
        "",
        trimmedDescription.slice(0, 14000),
      ].join("\n"),
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          roleTitle: { anyOf: [{ type: "string" }, { type: "null" }] },
          requiredSkills: { type: "array", items: { type: "string" } },
          experienceNeeded: { anyOf: [{ type: "number" }, { type: "null" }] },
          seniority: {
            anyOf: [
              { type: "string", enum: ["JUNIOR", "MID", "SENIOR"] },
              { type: "null" },
            ],
          },
          summary: { type: "string" },
        },
        required: ["roleTitle", "requiredSkills", "experienceNeeded", "seniority", "summary"],
      },
    })

    return normalizeParsedJobDescription(parsed ?? fallback, trimmedDescription, titleHint)
  } catch (error) {
    console.error("Failed to parse job description with OpenAI", error)
    return fallback
  }
}

function normalizeSkill(value: string) {
  return value.trim().toLowerCase()
}

function getCandidateSkills(candidate: ParsedResume | Record<string, unknown>) {
  const skills = Array.isArray(candidate.skills) ? candidate.skills : []
  return skills.filter((skill): skill is string => typeof skill === "string" && Boolean(skill.trim()))
}

function getCandidateExperience(candidate: ParsedResume | Record<string, unknown>) {
  const experienceYears =
    "experienceYears" in candidate ? candidate.experienceYears : (candidate as Record<string, unknown>).experience_years

  if (typeof experienceYears === "number" && Number.isFinite(experienceYears)) {
    return experienceYears
  }

  return null
}

function fallbackMatchCandidate(input: {
  candidate: ParsedResume | Record<string, unknown>
  job: ParsedJobDescription
}): CandidateMatchResult {
  const candidateSkills = new Set(getCandidateSkills(input.candidate).map(normalizeSkill))
  const requiredSkills = input.job.requiredSkills.filter(Boolean)
  const matchedSkillCount = requiredSkills.filter((skill) => candidateSkills.has(normalizeSkill(skill))).length
  const skillMatch =
    requiredSkills.length > 0 ? Math.round((matchedSkillCount / requiredSkills.length) * 100) : 50
  const candidateExperience = getCandidateExperience(input.candidate)
  const experienceNeeded = input.job.experienceNeeded
  const experienceMatch =
    candidateExperience === null || experienceNeeded === null
      ? 55
      : clampScore((candidateExperience / Math.max(experienceNeeded, 1)) * 100)
  const matchScore = clampScore(skillMatch * 0.68 + experienceMatch * 0.32)
  const missingSkills = requiredSkills.filter((skill) => !candidateSkills.has(normalizeSkill(skill))).slice(0, 12)
  const riskLevel = matchScore >= 75 ? "LOW" : matchScore >= 50 ? "MEDIUM" : "HIGH"
  const recommendation =
    matchScore >= 82 ? "STRONG_FIT" : matchScore >= 62 ? "POTENTIAL" : matchScore >= 42 ? "WEAK" : "REJECT"

  return {
    matchScore,
    skillMatch,
    experienceMatch,
    missingSkills,
    riskLevel,
    recommendation,
    shortReasoning:
      missingSkills.length > 0
        ? `Candidate covers ${matchedSkillCount}/${requiredSkills.length || 0} required skills; gaps include ${missingSkills.slice(0, 4).join(", ")}.`
        : "Candidate skills and experience align with the job requirements.",
  }
}

function normalizeMatchResult(result: CandidateMatchResult, fallback: CandidateMatchResult): CandidateMatchResult {
  const riskLevel =
    result.riskLevel === "LOW" || result.riskLevel === "MEDIUM" || result.riskLevel === "HIGH"
      ? result.riskLevel
      : fallback.riskLevel
  const recommendation =
    result.recommendation === "STRONG_FIT" ||
    result.recommendation === "POTENTIAL" ||
    result.recommendation === "WEAK" ||
    result.recommendation === "REJECT"
      ? result.recommendation
      : fallback.recommendation

  return {
    matchScore: clampScore(result.matchScore),
    skillMatch: clampScore(result.skillMatch),
    experienceMatch: clampScore(result.experienceMatch),
    missingSkills: Array.isArray(result.missingSkills)
      ? result.missingSkills.filter((skill): skill is string => typeof skill === "string").slice(0, 20)
      : fallback.missingSkills,
    riskLevel,
    recommendation,
    shortReasoning: result.shortReasoning?.trim() || fallback.shortReasoning,
  }
}

export async function matchCandidateToJobWithAI(input: {
  candidateJson: ParsedResume | Record<string, unknown>
  resumeText?: string | null
  job: ParsedJobDescription & {
    title: string
    description: string
  }
}) {
  const fallback = fallbackMatchCandidate({
    candidate: input.candidateJson,
    job: input.job,
  })

  if (!process.env.OPENAI_API_KEY) {
    return fallback
  }

  try {
    const parsed = await callOpenAIJson<CandidateMatchResult>({
      schemaName: "candidate_job_match",
      system:
        "Compare the candidate resume with the job description. Score conservatively and return only JSON matching the schema.",
      user: [
        "Compare this resume with this job description.",
        "",
        "Return:",
        "- match_score (0-100)",
        "- skill_match (0-100)",
        "- experience_match (0-100)",
        "- missing_skills",
        "- risk_level (LOW/MEDIUM/HIGH)",
        "- recommendation (STRONG_FIT, POTENTIAL, WEAK, REJECT)",
        "- short reasoning",
        "",
        `Job title: ${input.job.title}`,
        `Job required skills: ${input.job.requiredSkills.join(", ") || "N/A"}`,
        `Experience needed: ${input.job.experienceNeeded ?? "N/A"}`,
        "",
        "Job description:",
        input.job.description.slice(0, 10000),
        "",
        "Candidate structured data:",
        JSON.stringify(input.candidateJson).slice(0, 7000),
        "",
        "Resume text:",
        (input.resumeText ?? "").slice(0, 8000),
      ].join("\n"),
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          matchScore: { type: "integer", minimum: 0, maximum: 100 },
          skillMatch: { type: "integer", minimum: 0, maximum: 100 },
          experienceMatch: { type: "integer", minimum: 0, maximum: 100 },
          missingSkills: { type: "array", items: { type: "string" } },
          riskLevel: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
          recommendation: {
            type: "string",
            enum: ["STRONG_FIT", "POTENTIAL", "WEAK", "REJECT"],
          },
          shortReasoning: { type: "string" },
        },
        required: [
          "matchScore",
          "skillMatch",
          "experienceMatch",
          "missingSkills",
          "riskLevel",
          "recommendation",
          "shortReasoning",
        ],
      },
    })

    return normalizeMatchResult(parsed ?? fallback, fallback)
  } catch (error) {
    console.error("Failed to match candidate with OpenAI", error)
    return fallback
  }
}
