import { NextResponse, type NextRequest } from "next/server"

const LOGIN_URL =
  process.env.NEXT_PUBLIC_RECRUITER_LOGIN_URL ||
  process.env.NEXT_PUBLIC_AUTH_APP_URL ||
  process.env.NEXT_PUBLIC_LOGIN_URL ||
  "https://auth.hireveri.com"

const PROTECTED_PAGE_PREFIXES = [
  "/",
  "/ai-screening",
  "/jobs",
  "/candidates",
  "/interviews",
  "/reports",
  "/manage-team",
  "/settings",
  "/contact-us",
]

const PROTECTED_API_PREFIXES = [
  "/api/me",
  "/api/dashboard",
  "/api/upload-resumes",
  "/api/process-jd",
  "/api/match-candidates",
  "/api/send-interviews",
  "/api/ai-screening",
  "/api/jobs",
  "/api/candidate",
  "/api/interview/create-link",
  "/api/interview/manage",
  "/api/manage-team",
  "/api/experience-levels",
  "/api/war-room",
]

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"))
}

function hasAuthorizationHeader(request: NextRequest) {
  const authorization = request.headers.get("authorization")
  return Boolean(authorization && authorization.toLowerCase().startsWith("bearer "))
}

function hasAuthenticatedSession(request: NextRequest) {
  return Boolean(
    request.cookies.get("hireveri_session")?.value ||
      hasSupabaseAuthCookie(request) ||
      hasAuthorizationHeader(request)
  )
}

function isProtectedPage(pathname: string) {
  return PROTECTED_PAGE_PREFIXES.some((prefix) => pathname === prefix || (prefix !== "/" && pathname.startsWith(prefix)))
}

function isProtectedApi(pathname: string) {
  return PROTECTED_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!isProtectedPage(pathname) && !isProtectedApi(pathname)) {
    return NextResponse.next()
  }

  if (hasAuthenticatedSession(request)) {
    return NextResponse.next()
  }

  if (isProtectedApi(pathname)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication is required",
        },
      },
      { status: 401 }
    )
  }

  const loginUrl = new URL(LOGIN_URL)
  loginUrl.searchParams.set("next", request.nextUrl.href)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
}
