"use client";

const DEFAULT_WAR_APP_URL = "https://war-room.hireveri.com";
const WAR_ROOM_PATH = "/recruiter/war-room";
const SHARED_COOKIE_DOMAIN = ".hireveri.com";
const SHARED_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 2;

export const WAR_APP_URL = (process.env.NEXT_PUBLIC_WAR_APP_URL || DEFAULT_WAR_APP_URL).replace(/\/+$/, "");

function setSharedWarCookie(name, value) {
  const encodedValue = encodeURIComponent(value);
  document.cookie = `${name}=${encodedValue}; Path=/; Domain=${SHARED_COOKIE_DOMAIN}; Max-Age=${SHARED_COOKIE_MAX_AGE_SECONDS}; SameSite=None; Secure`;
}

async function fetchWarRoomSession() {
  const response = await fetch("/api/war-room/session", {
    credentials: "include",
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.success) {
    return null;
  }

  return payload.data ?? null;
}

export async function openWarRoom(orgIdOverride) {
  const session = await fetchWarRoomSession();
  const authToken =
    typeof session?.authToken === "string" && session.authToken.trim() ? session.authToken.trim() : null;
  const orgIdFromSession =
    typeof session?.organizationId === "string" && session.organizationId.trim()
      ? session.organizationId.trim()
      : null;
  const orgIdFromOverride =
    typeof orgIdOverride === "string" && orgIdOverride.trim() ? orgIdOverride.trim() : null;
  const orgId = orgIdFromOverride || orgIdFromSession;

  if (!authToken || !orgId) {
    window.alert("Unable to open War Room because the authenticated handoff could not be prepared.");
    return false;
  }

  setSharedWarCookie("authToken", authToken);
  setSharedWarCookie("accessToken", authToken);

  const redirectUrl = new URL(`${WAR_APP_URL}${WAR_ROOM_PATH}`);
  redirectUrl.searchParams.set("orgId", orgId);
  window.location.href = redirectUrl.toString();
  return true;
}
