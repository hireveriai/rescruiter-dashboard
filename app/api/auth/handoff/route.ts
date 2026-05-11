import { NextResponse } from "next/server"

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const AUTH_COOKIE_NAMES = [
  "hireveri_session",
  "authToken",
  "accessToken",
  "access_token",
  "token",
]
const LEGACY_COOKIE_DOMAINS = [".hireveri.com", ".verihireai.work"]

function sameOriginPath(value: string | null) {
  if (!value) {
    return "/"
  }

  try {
    const parsed = new URL(value, "https://recruiter.hireveri.com")
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return "/"
  }
}

function cookieOptions(request: Request) {
  const hostname = new URL(request.url).hostname
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1"

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: !isLocalhost,
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const token = url.searchParams.get("token")?.trim()
  const session = url.searchParams.get("session")?.trim()
  const next = sameOriginPath(url.searchParams.get("next"))

  if (!token && !session) {
    return NextResponse.redirect(new URL("/", url.origin))
  }

  const response = NextResponse.redirect(new URL(next, url.origin))
  const options = cookieOptions(request)

  for (const name of AUTH_COOKIE_NAMES) {
    for (const domain of LEGACY_COOKIE_DOMAINS) {
      response.cookies.set(name, "", {
        ...options,
        domain,
        maxAge: 0,
      })
    }
  }

  if (token) {
    response.cookies.set("authToken", token, options)
  }

  if (session) {
    response.cookies.set("hireveri_session", session, options)
  }

  return response
}
