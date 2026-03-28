export type CurrentUser = {
  userId: string
  organizationId: string
  role: "RECRUITER"
}

// Replace with real auth session later
export function getCurrentUser(): CurrentUser {
  return {
    userId: "22222222-0000-0000-0000-000000000002",
    organizationId: "11111111-0000-0000-0000-000000000001",
    role: "RECRUITER",
  }
}
