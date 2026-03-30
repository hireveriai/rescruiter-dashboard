export type CurrentUser = {
  userId: string
  organizationId: string
  role: "RECRUITER"
}

export function getCurrentUser(): CurrentUser {
  throw new Error("getCurrentUser is deprecated. Use getRecruiterRequestContext(request) instead.")
}
