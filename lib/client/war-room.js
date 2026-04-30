"use client";

const DEFAULT_WAR_APP_URL = "https://war-room.hireveri.com";

export const WAR_APP_URL = (process.env.NEXT_PUBLIC_WAR_APP_URL || DEFAULT_WAR_APP_URL).replace(/\/+$/, "");

export function openWarRoom() {
  window.location.href = WAR_APP_URL;
  return true;
}
