import { clearHireveriSessionCookie, getRecruiterLoginUrl } from "@/lib/client/auth-session"

export function clearRecruiterSessionCookie() {
  clearHireveriSessionCookie()
}

export function logoutRecruiter(redirectUrl = getRecruiterLoginUrl()) {
  clearRecruiterSessionCookie()
  window.location.href = redirectUrl
}