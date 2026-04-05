export const DEFAULT_RECRUITER_LOGIN_URL = process.env.NEXT_PUBLIC_RECRUITER_LOGIN_URL || "https://hireveri.com"

export function getRecruiterLoginUrl() {
  return DEFAULT_RECRUITER_LOGIN_URL
}

export function clearHireveriSessionCookie() {
  const expires = "Max-Age=0; path=/"
  const domains = ["", "; domain=.hireveri.com", "; domain=.verihireai.work"]

  domains.forEach((domain) => {
    document.cookie = `hireveri_session=; ${expires}${domain}`
  })
}