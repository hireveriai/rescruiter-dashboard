type InviteStatusInput = {
  status: string | null
  usedAt?: Date | string | null
  expiresAt?: Date | string | null
}

type AttemptStatusInput = {
  attemptId?: string | null
  status?: string | null
  endedAt?: Date | string | null
}

type DeriveInterviewStatusInput = {
  interviewStatus: string | null
  questionStatus?: string | null
  emailStatus?: string | null
  latestAttempt?: AttemptStatusInput | null
  latestInvite?: InviteStatusInput | null
}

function normalizeStatus(status: string | null | undefined) {
  return String(status ?? "").trim().toUpperCase()
}

export function isInviteUsable(invite: InviteStatusInput) {
  const normalizedStatus = normalizeStatus(invite.status || "ACTIVE")
  const expiresAt = invite.expiresAt ? new Date(invite.expiresAt) : null
  const isExpired = expiresAt ? expiresAt.getTime() <= Date.now() : false

  return normalizedStatus === "ACTIVE" && !invite.usedAt && !isExpired
}

export function isAttemptCompleted(attempt: AttemptStatusInput) {
  const normalizedStatus = normalizeStatus(attempt.status)
  return normalizedStatus === "COMPLETED" || Boolean(attempt.endedAt)
}

export function deriveInterviewStatus({
  interviewStatus,
  questionStatus,
  emailStatus,
  latestAttempt,
  latestInvite,
}: DeriveInterviewStatusInput) {
  const normalizedInterviewStatus = normalizeStatus(interviewStatus)
  const normalizedQuestionStatus = normalizeStatus(questionStatus)
  const normalizedEmailStatus = normalizeStatus(emailStatus)
  const normalizedInviteStatus = normalizeStatus(latestInvite?.status)
  const hasStartedAttempt = Boolean(latestAttempt?.attemptId)

  if (normalizedInterviewStatus === "FAILED" || normalizedQuestionStatus === "FAILED") {
    return "PREPARATION_FAILED"
  }

  if (normalizedInterviewStatus === "PREPARING" || normalizedQuestionStatus === "GENERATING") {
    return "PREPARING_INTERVIEW"
  }

  if (normalizedInterviewStatus === "COMPLETED" || (latestAttempt ? isAttemptCompleted(latestAttempt) : false)) {
    return "COMPLETED"
  }

  if (normalizedInterviewStatus === "FLAGGED") {
    return "FLAGGED"
  }

  if (hasStartedAttempt) {
    return "IN_PROGRESS"
  }

  if (normalizedInterviewStatus === "READY" && normalizedEmailStatus === "FAILED") {
    return "EMAIL_FAILED"
  }

  if (normalizedEmailStatus === "SENDING") {
    return "SENDING_EMAIL"
  }

  if (normalizedInterviewStatus === "READY") {
    return "READY"
  }

  if (latestInvite && !isInviteUsable(latestInvite) && normalizedInviteStatus) {
    return normalizedInviteStatus
  }

  return normalizedInterviewStatus || "PENDING"
}
