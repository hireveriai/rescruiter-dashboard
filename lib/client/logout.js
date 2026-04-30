import { clearHireveriSessionCookie, getRecruiterLoginUrl } from "@/lib/client/auth-session"

export function clearRecruiterSessionCookie() {
  clearHireveriSessionCookie()
}

export function logoutRecruiter(redirectUrl = getRecruiterLoginUrl()) {
  clearRecruiterSessionCookie()
  window.localStorage.removeItem("hireveri:last-activity-at")
  window.sessionStorage.removeItem("hireveri-overview")
  window.location.href = redirectUrl
}
