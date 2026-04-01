const DEFAULT_LOGOUT_URL = "https://verihireai.work";

export function clearRecruiterSessionCookie() {
  document.cookie = "hireveri_session=; Max-Age=0; path=/";
}

export function logoutRecruiter(redirectUrl = DEFAULT_LOGOUT_URL) {
  clearRecruiterSessionCookie();
  window.location.href = redirectUrl;
}
