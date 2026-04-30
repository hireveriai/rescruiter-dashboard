"use client";

export function openWarRoom(orgIdOverride) {
  const launchUrl = new URL("/api/war-room/launch", window.location.origin);

  if (typeof orgIdOverride === "string" && orgIdOverride.trim()) {
    launchUrl.searchParams.set("orgId", orgIdOverride.trim());
  }

  window.open(launchUrl.toString(), "_blank", "noopener,noreferrer");
  return true;
}
