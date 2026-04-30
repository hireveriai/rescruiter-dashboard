"use client";

async function readLiveOrganizationId() {
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
    return typeof organizationId === "string" && organizationId.trim()
      ? organizationId.trim()
      : null;
  } catch {
    return null;
  }
}

export async function openWarRoom(orgIdOverride) {
  const liveOrganizationId = await readLiveOrganizationId();
  const organizationId =
    liveOrganizationId ||
    (typeof orgIdOverride === "string" && orgIdOverride.trim()
      ? orgIdOverride.trim()
      : null);

  if (!organizationId) {
    window.alert("Unable to open War Room because the live organization context could not be resolved.");
    return false;
  }

  const launchUrl = new URL("/api/war-room/launch", window.location.origin);
  launchUrl.searchParams.set("orgId", organizationId);

  window.open(launchUrl.toString(), "_blank", "noopener,noreferrer");
  return true;
}
