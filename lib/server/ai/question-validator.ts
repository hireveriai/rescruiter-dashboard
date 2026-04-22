export type ValidationResult = {
  valid: boolean
  reason?: string
}

export function validateQuestionStrict(q: string): ValidationResult {
  const lower = q.toLowerCase().trim()

  // length control
  const wordCount = lower.split(/\s+/).length
  if (wordCount < 6) return { valid: false, reason: "too_short" }
  if (wordCount > 18) return { valid: false, reason: "too_long" }

  // bad prefixes (your biggest issue)
  if (
    lower.includes("you highlighted") ||
    lower.includes("your background") ||
    lower.includes("worked as") ||
    lower.includes("your experience includes")
  ) {
    return { valid: false, reason: "resume_leak" }
  }

  // JD copy patterns
  if (
    lower.includes("develop analytics-ready") ||
    lower.includes("optimize spark jobs") ||
    lower.includes("including star schemas")
  ) {
    return { valid: false, reason: "jd_copy" }
  }

  // multiple clauses (your current bug)
  if (q.split(",").length > 1) {
    return { valid: false, reason: "multi_clause" }
  }

  // must start correctly
  if (!/^(how|what|walk)/i.test(q)) {
    return { valid: false, reason: "bad_format" }
  }

  // generic garbage
  if (
    lower.includes("in this role") ||
    lower.includes("your role") ||
    lower.includes("generally")
  ) {
    return { valid: false, reason: "generic" }
  }

  return { valid: true }
}