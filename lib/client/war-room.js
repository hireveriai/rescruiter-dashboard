"use client";

const DEFAULT_WAR_APP_URL = "https://war-room.hireveri.com";
const WAR_ROOM_PATH = "/recruiter/war-room";
const TOKEN_COOKIE_KEYS = ["authToken", "accessToken", "access_token", "token"];
const ORG_ID_CLAIMS = ["orgId", "org_id", "organizationId", "organization_id", "tenantId", "tenant_id"];
const CLAIM_CONTAINERS = ["app_metadata", "user_metadata", "metadata", "claims", "tenant", "organization", "org"];

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

function parseCookieMap() {
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

function parseSupabaseAuthCookieValue(rawValue) {
  if (!rawValue) {
    return null;
  }

  let decoded = rawValue;

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = rawValue;
  }

  if (decoded.startsWith("base64-")) {
    const base64Decoded = decodeBase64Url(decoded.slice("base64-".length));
    if (base64Decoded) {
      decoded = base64Decoded;
    }
  }

  try {
    const parsed = JSON.parse(decoded);

    if (Array.isArray(parsed)) {
      const firstString = parsed.find((item) => typeof item === "string" && item.split(".").length >= 2);
      return typeof firstString === "string" ? firstString : null;
    }

    if (parsed && typeof parsed === "object") {
      return parsed.access_token ?? parsed.accessToken ?? null;
    }

    return null;
  } catch {
    const trimmed = decoded.trim();
    return trimmed.split(".").length >= 2 ? trimmed : null;
  }
}

function readSupabaseJwtFromCookies(cookieMap) {
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
    const token = parseSupabaseAuthCookieValue(chunks.filter(Boolean).join(""));
    if (token) {
      return token;
    }
  }

  return null;
}

function readAuthTokenFromCookies() {
  const cookieMap = parseCookieMap();

  for (const key of TOKEN_COOKIE_KEYS) {
    const token = parseSupabaseAuthCookieValue(cookieMap[key]);
    if (token) {
      return token;
    }
  }

  return readSupabaseJwtFromCookies(cookieMap);
}

function decodeJwtPayload(token) {
  if (typeof token !== "string") {
    return null;
  }

  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  const payload = decodeBase64Url(parts[1]);
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
  }

  return null;
}

function readOrgIdFromPayload(payload) {
  const rootClaim = readStringClaim(payload, ORG_ID_CLAIMS);

  if (rootClaim) {
    return rootClaim;
  }

  for (const containerKey of CLAIM_CONTAINERS) {
    const nestedClaim = readStringClaim(payload?.[containerKey], ORG_ID_CLAIMS);
    if (nestedClaim) {
      return nestedClaim;
    }
  }

  return null;
}

async function readOrgIdFromSession() {
  try {
    const response = await fetch("/api/me", {
      credentials: "include",
      cache: "no-store",
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success) {
      return null;
    }

    const organizationId = payload?.data?.organizationId;
    return typeof organizationId === "string" && organizationId.trim() ? organizationId.trim() : null;
  } catch {
    return null;
  }
}

export async function openWarRoom(orgIdOverride) {
  const orgIdFromOverride =
    typeof orgIdOverride === "string" && orgIdOverride.trim() ? orgIdOverride.trim() : null;
  const token = readAuthTokenFromCookies();
  const orgIdFromToken = readOrgIdFromPayload(decodeJwtPayload(token));
  const orgId = orgIdFromOverride || orgIdFromToken || (await readOrgIdFromSession());

  if (!orgId) {
    window.alert("Unable to open War Room because organization context could not be resolved for this session.");
    return false;
  }

  const redirectUrl = new URL(`${WAR_APP_URL}${WAR_ROOM_PATH}`);
  redirectUrl.searchParams.set("orgId", orgId);
  window.location.href = redirectUrl.toString();
  return true;
}
