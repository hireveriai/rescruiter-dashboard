import { clearHireveriSessionCookie, getRecruiterLoginUrl } from "@/lib/client/auth-session"

async function clearBrowserCaches() {
  if (!("caches" in window)) {
    return
  }

  try {
    const cacheNames = await window.caches.keys()
    await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)))
  } catch {
    // Cache cleanup should never block logout.
  }
}

function clearBrowserStorage() {
  try {
    window.localStorage.clear()
  } catch {
    window.localStorage.removeItem("hireveri:last-activity-at")
  }

  try {
    window.sessionStorage.clear()
  } catch {
    window.sessionStorage.removeItem("hireveri-overview")
  }
}

export function clearRecruiterSessionCookie() {
  clearHireveriSessionCookie()
}

export async function logoutRecruiter(redirectUrl = getRecruiterLoginUrl()) {
  clearRecruiterSessionCookie()
  clearBrowserStorage()
  await clearBrowserCaches()
  window.location.href = redirectUrl
}
