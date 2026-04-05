const AUTH_APP_FALLBACK_URL = "https://auth.hireveri.com"

export function getRecruiterLoginUrl() {
  return (
    process.env.NEXT_PUBLIC_RECRUITER_LOGIN_URL ||
    process.env.NEXT_PUBLIC_AUTH_APP_URL ||
    process.env.NEXT_PUBLIC_LOGIN_URL ||
    AUTH_APP_FALLBACK_URL
  )
}

export function clearHireveriSessionCookie() {
  const expires = "Max-Age=0; path=/"
  const domains = ["", "; domain=.hireveri.com", "; domain=.verihireai.work"]

  domains.forEach((domain) => {
    document.cookie = `hireveri_session=; ${expires}${domain}`
  })
}
