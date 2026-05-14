export type DashboardStateMetricsInput = {
  jobs_count?: number | null
  veris_screening_count?: number | null
  interview_links_count?: number | null
  interviews_count?: number | null
  pending_reviews_count?: number | null
}

export type DashboardHeroState = "NO_JOB_CREATED" | "VERIS_OPTIONAL" | "WORKFLOW_ACTIVE"

export type DashboardStateSnapshot = {
  heroState: DashboardHeroState
  jobs_count: number
  veris_screening_count: number
  interview_links_count: number
  interviews_count: number
  pending_reviews_count: number
}

function toCount(value: number | null | undefined) {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0
}

export function deriveDashboardState(input: DashboardStateMetricsInput): DashboardStateSnapshot {
  const snapshot = {
    jobs_count: toCount(input.jobs_count),
    veris_screening_count: toCount(input.veris_screening_count),
    interview_links_count: toCount(input.interview_links_count),
    interviews_count: toCount(input.interviews_count),
    pending_reviews_count: toCount(input.pending_reviews_count),
    heroState: "NO_JOB_CREATED" as DashboardHeroState,
  }

  if (snapshot.jobs_count === 0) {
    snapshot.heroState = "NO_JOB_CREATED"
    return snapshot
  }

  if (snapshot.interview_links_count > 0 || snapshot.interviews_count > 0) {
    snapshot.heroState = "WORKFLOW_ACTIVE"
    return snapshot
  }

  if (snapshot.veris_screening_count === 0) {
    snapshot.heroState = "VERIS_OPTIONAL"
    return snapshot
  }

  snapshot.heroState = "WORKFLOW_ACTIVE"
  return snapshot
}
