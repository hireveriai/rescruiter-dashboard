"use client";

const DEFAULT_WAR_APP_URL = "https://war-room.hireveri.com";
const WAR_TOKEN_COOKIE_NAME = "hireveri_war_token";
const COOKIE_MAX_AGE_SECONDS = 60 * 60;

const TOKEN_STORAGE_KEYS = [
  "hireveri_war_token",
  "hireveri_auth_token",
  "hireveri_token",
  "authToken",
  "accessToken",
  "access_token",
  "token",
];

const TOKEN_FIELD_KEYS = [
  "access_token",
  "accessToken",
  "authToken",
  "id_token",
  "idToken",
  "token",
];

const USER_ID_CLAIMS = ["userId", "user_id", "sub", "identityId", "identity_id", "id"];
const ORG_ID_CLAIMS = ["orgId", "org_id", "organizationId", "organization_id", "tenantId", "tenant_id"];
const CLAIM_CONTAINERS = ["app_metadata", "user_metadata", "metadata", "claims", "tenant", "organization", "org"];

const SHARED_COOKIE_DOMAINS = [".hireveri.com", ".verihireai.work"];

export const WAR_APP_URL = (process.env.NEXT_PUBLIC_WAR_APP_URL || DEFAULT_WAR_APP_URL).replace(/\/+$/, "");

function decodeBase64Url(value) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = window.atob(normalized);

    if (typeof window.TextDecoder === "function") {
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new window.TextDecoder().decode(bytes);
    }

    return binary;
  } catch {
    return null;
  }
}

function isLikelyJwt(value) {
  return typeof value === "string" && value.split(".").length >= 3;
}

function decodeJwtPayload(token) {
  if (!isLikelyJwt(token)) {
    return null;
  }

  const payload = decodeBase64Url(token.split(".")[1]);
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function readStringClaim(source, keys) {
  if (!source || typeof source !== "object") {
    return null;
  }

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function readClaim(payload, keys) {
  const rootClaim = readStringClaim(payload, keys);
  if (rootClaim) {
    return rootClaim;
  }

  for (const containerKey of CLAIM_CONTAINERS) {
    const nestedClaim = readStringClaim(payload?.[containerKey], keys);
    if (nestedClaim) {
      return nestedClaim;
    }
  }

  return null;
}

function decodeWarRoomContext(token) {
  const payload = decodeJwtPayload(token);

  if (!payload) {
    return null;
  }

  return {
    orgId: readClaim(payload, ORG_ID_CLAIMS),
    userId: readClaim(payload, USER_ID_CLAIMS),
  };
}

function decodeMaybeEncodedValue(rawValue) {
  let decoded = String(rawValue || "").trim();

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = String(rawValue || "").trim();
  }

  if (decoded.startsWith("base64-")) {
    const base64Decoded = decodeBase64Url(decoded.slice("base64-".length));
    if (base64Decoded) {
      return base64Decoded;
    }
  }

  return decoded;
}

function extractJwtFromParsedValue(value, depth = 0) {
  if (!value || depth > 4) {
    return null;
  }

  if (typeof value === "string") {
    return extractJwtFromStorageValue(value, depth + 1);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const token = extractJwtFromParsedValue(item, depth + 1);
      if (token) {
        return token;
      }
    }

    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  for (const key of TOKEN_FIELD_KEYS) {
    const token = extractJwtFromParsedValue(value[key], depth + 1);
    if (token) {
      return token;
    }
  }

  for (const nestedValue of Object.values(value)) {
    const token = extractJwtFromParsedValue(nestedValue, depth + 1);
    if (token) {
      return token;
    }
  }

  return null;
}

function extractJwtFromStorageValue(rawValue, depth = 0) {
  if (!rawValue || depth > 4) {
    return null;
  }

  const decoded = decodeMaybeEncodedValue(rawValue);

  if (isLikelyJwt(decoded)) {
    return decoded;
  }

  try {
    return extractJwtFromParsedValue(JSON.parse(decoded), depth + 1);
  } catch {
    return null;
  }
}

function readLocalStorageToken() {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  for (const key of TOKEN_STORAGE_KEYS) {
    const token = extractJwtFromStorageValue(window.localStorage.getItem(key));
    if (token) {
      return token;
    }
  }

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) {
      continue;
    }

    const token = extractJwtFromStorageValue(window.localStorage.getItem(key));
    if (token) {
      return token;
    }
  }

  return null;
}

function readCookieMap() {
  if (typeof document === "undefined" || !document.cookie) {
    return {};
  }

  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");

      if (separatorIndex === -1) {
        return cookies;
      }

      cookies[part.slice(0, separatorIndex).trim()] = part.slice(separatorIndex + 1).trim();
      return cookies;
    }, {});
}

function readSupabaseCookieToken(cookieMap) {
  const authCookieKeys = Object.keys(cookieMap).filter((key) => key.startsWith("sb-") && key.includes("-auth-token"));

  if (authCookieKeys.length === 0) {
    return null;
  }

  const grouped = {};

  authCookieKeys.forEach((key) => {
    const chunkMatch = key.match(/^(.*)\.(\d+)$/);

    if (chunkMatch) {
      const baseKey = chunkMatch[1];
      const index = Number(chunkMatch[2]);
      grouped[baseKey] = grouped[baseKey] || [];
      grouped[baseKey][index] = cookieMap[key];
      return;
    }

    grouped[key] = [cookieMap[key]];
  });

  for (const chunks of Object.values(grouped)) {
    const token = extractJwtFromStorageValue(chunks.filter(Boolean).join(""));
    if (token) {
      return token;
    }
  }

  return null;
}

function readCookieToken() {
  const cookieMap = readCookieMap();

  for (const key of TOKEN_STORAGE_KEYS) {
    const token = extractJwtFromStorageValue(cookieMap[key]);
    if (token) {
      return token;
    }
  }

  return readSupabaseCookieToken(cookieMap);
}

function getCookieMaxAge(token) {
  const payload = decodeJwtPayload(token);
  const expiresAt = Number(payload?.exp);

  if (!Number.isFinite(expiresAt)) {
    return COOKIE_MAX_AGE_SECONDS;
  }

  const secondsUntilExpiry = Math.max(0, Math.floor(expiresAt - Date.now() / 1000));
  return Math.min(secondsUntilExpiry, COOKIE_MAX_AGE_SECONDS);
}

function isTokenExpired(token) {
  const payload = decodeJwtPayload(token);
  const expiresAt = Number(payload?.exp);

  return Number.isFinite(expiresAt) && expiresAt <= Date.now() / 1000;
}

function getWritableCookieDomains() {
  const currentHost = window.location.hostname;
  const domains = [""];

  SHARED_COOKIE_DOMAINS.forEach((domain) => {
    const normalizedDomain = domain.slice(1);
    if (currentHost === normalizedDomain || currentHost.endsWith(domain)) {
      domains.push(domain);
    }
  });

  return domains;
}

function storeWarRoomTokenCookie(token) {
  const secureCookie = window.location.protocol === "https:";
  const sameSite = secureCookie ? "SameSite=None" : "SameSite=Lax";
  const secure = secureCookie ? "; Secure" : "";
  const maxAge = getCookieMaxAge(token);
  const encodedToken = encodeURIComponent(token);

  getWritableCookieDomains().forEach((domain) => {
    const domainPart = domain ? `; Domain=${domain}` : "";
    document.cookie = `${WAR_TOKEN_COOKIE_NAME}=${encodedToken}; Path=/; Max-Age=${maxAge}; ${sameSite}${secure}${domainPart}`;
  });
}

function alertWarRoomError(message) {
  window.alert(message);
}

export function readAuthTokenForWarRoom() {
  return readLocalStorageToken() || readCookieToken();
}

export function openWarRoom() {
  const token = readAuthTokenForWarRoom();

  if (!token) {
    alertWarRoomError("Unable to open War Room because no auth token was found in this browser session.");
    return false;
  }

  const context = decodeWarRoomContext(token);

  if (!context?.orgId || !context?.userId) {
    alertWarRoomError("Unable to open War Room because the auth token does not include both organization and user context.");
    return false;
  }

  if (isTokenExpired(token)) {
    alertWarRoomError("Unable to open War Room because the auth token has expired. Please sign in again.");
    return false;
  }

  storeWarRoomTokenCookie(token);
  window.location.href = `${WAR_APP_URL}/war-room`;
  return true;
}
