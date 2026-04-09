import { ApiError, isApiError } from "@/lib/server/errors"

const functionErrorMap = {
  INVALID_EXPERIENCE_LEVEL: { statusCode: 400, message: "experience_level_id does not exist" },
  INVALID_EXPECTED_LEVEL: { statusCode: 400, message: "expected_level must be between 1 and 4" },
  JOB_NOT_FOUND: { statusCode: 404, message: "Job not found for this organization" },
  CANDIDATE_NOT_FOUND: { statusCode: 404, message: "candidate not found" },
  INTERVIEW_INVITE_NOT_FOUND: { statusCode: 404, message: "Interview invite not found" },
  INTERVIEW_INVITE_LOCKED: { statusCode: 409, message: "Interview invite can no longer be changed" },
  INTERVIEW_INVITE_INACTIVE: { statusCode: 409, message: "Interview invite is no longer active" },
  USER_ORG_MISMATCH: { statusCode: 400, message: "User already exists under a different organization" },
  ORGANIZATION_MISMATCH: { statusCode: 400, message: "candidate and job must belong to the same organization" },
  TEMPLATE_NOT_FOUND: { statusCode: 404, message: "No active evaluation template found" },
  INVALID_TIME: { statusCode: 400, message: "Invalid interview time window" },
  INVALID_ACCESS_TYPE: { statusCode: 400, message: "Invalid interview access type" },
  REVOKE_REASON_REQUIRED: { statusCode: 400, message: "Revoke reason is required" },
  INSUFFICIENT_PERMISSION: { statusCode: 403, message: "You do not have permission for this action" },
}

export function toFunctionApiError(error, fallback) {
  if (isApiError(error)) {
    return error
  }

  const rawMessage = error instanceof Error ? error.message : fallback.message
  const [rawCode, ...rest] = rawMessage.split(":")
  const code = rawCode.trim().toUpperCase()

  if (functionErrorMap[code]) {
    const mapped = functionErrorMap[code]
    return new ApiError(mapped.statusCode, code, rest.join(":").trim() || mapped.message)
  }

  return new ApiError(fallback.statusCode, fallback.code, fallback.message)
}
