import { clearHireveriSessionCookie, getRecruiterLoginUrl } from "@/lib/client/auth-session"

const LOGOUT_TIMEOUT_MS = 1200

function withTimeout(promise, timeoutMs = LOGOUT_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

async function clearBrowserCaches() {
  if (typeof window === "undefined" || !("caches" in window)) {
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
  if (typeof window === "undefined") {
    return
  }

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

async function clearServerSession() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      keepalive: true,
      headers: {
        "Cache-Control": "no-store",
      },
    })
  } catch {
    // Client-side cookie and storage cleanup still runs even if the network is interrupted.
  }
}

export function clearRecruiterSessionCookie() {
  clearHireveriSessionCookie()
}

export async function logoutRecruiter(redirectUrl = getRecruiterLoginUrl()) {
  if (typeof window === "undefined") {
    return
  }

  clearRecruiterSessionCookie()
  clearBrowserStorage()

  await withTimeout(Promise.allSettled([clearServerSession(), clearBrowserCaches()]))

  clearRecruiterSessionCookie()
  clearBrowserStorage()
  window.location.replace(redirectUrl)
}
