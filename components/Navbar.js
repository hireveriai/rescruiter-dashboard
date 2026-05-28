"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { buildAuthUrl, hasAuthQuery } from "@/lib/client/auth-query";
import { ACTION_FEEDBACK_EVENT } from "@/lib/client/action-feedback";
import { logoutRecruiter } from "@/lib/client/logout";
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params";
import { useAmbientLoading } from "@/components/system/loading";

const CreateJobModal = dynamic(() => import("./CreateJobModal"), {
  ssr: false,
});

const navItems = [
  { href: "/", label: "Dashboard", disabled: false },
  { href: "/ai-screening", label: "VERIS Screening", disabled: false },
  { href: "/jobs", label: "Jobs", disabled: false },
  { href: "/candidates", label: "Candidates", disabled: false },
  { href: "/interviews", label: "Interviews", disabled: false },
  { href: "/reports", label: "Reports", disabled: false },
  { href: "/billing", label: "Billing", disabled: false },
];

const navLoadingMessages = {
  "/": "Syncing recruiter dashboard...",
  "/jobs": "Loading job intelligence...",
  "/candidates": "Loading candidate pipeline...",
  "/interviews": "Syncing interview telemetry...",
  "/reports": "Updating forensic analytics...",
  "/billing": "Loading billing records...",
  "/manage-team": "Syncing team workspace...",
  "/settings": "Loading workspace settings...",
  "/contact-us": "Preparing contact workspace...",
};

const ALERT_READ_STORAGE_KEY = "hireveri-read-alert-ids";
const ALERTS_READ_EVENT = "hireveri:alerts-read";

function normalizeStorageKeyPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getAlertReadStorageKey(profile) {
  const organization = normalizeStorageKeyPart(profile?.organization);
  return organization ? `${ALERT_READ_STORAGE_KEY}:${organization}` : ALERT_READ_STORAGE_KEY;
}

function isActivePath(pathname, href) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

function CogIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 1-2 0 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 1 0-2 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 1 2 0 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.24.32.44.67.6 1a1.65 1.65 0 0 1 0 2c-.16.33-.36.68-.6 1Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function BillingIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
      <path d="M8 15h5" />
    </svg>
  );
}

function CreditsIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16v-5" />
      <path d="M12 16V8" />
      <path d="M16 16v-3" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

function getAlertToneClass(tone) {
  if (tone === "success") return "border-emerald-400/25 bg-emerald-500/10"
  if (tone === "warning") return "border-amber-400/25 bg-amber-500/10"
  if (tone === "danger") return "border-rose-400/25 bg-rose-500/10"
  return "border-cyan-400/25 bg-cyan-500/10"
}

function getFeedbackToneClass(tone) {
  if (tone === "success") {
    return "border-emerald-400/35 bg-emerald-500/10 text-emerald-100 shadow-[0_24px_70px_rgba(16,185,129,0.12)]";
  }

  if (tone === "warning") {
    return "border-amber-400/35 bg-amber-500/10 text-amber-100 shadow-[0_24px_70px_rgba(245,158,11,0.12)]";
  }

  if (tone === "error" || tone === "danger") {
    return "border-rose-400/35 bg-rose-500/10 text-rose-100 shadow-[0_24px_70px_rgba(244,63,94,0.12)]";
  }

  return "border-cyan-400/35 bg-cyan-500/10 text-cyan-100 shadow-[0_24px_70px_rgba(34,211,238,0.12)]";
}

function formatAlertTime(value) {
  if (!value) {
    return ""
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function Navbar({ onSendInterviewClick, initialProfile = null, initialAlerts = undefined }) {
  const pathname = usePathname();
  const searchParams = useAuthSearchParams();
  const { startLoading } = useAmbientLoading();
  const menuRef = useRef(null);
  const alertsRef = useRef(null);
  const feedbackTimerRef = useRef(null);
  const [openCreateJob, setOpenCreateJob] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alerts, setAlerts] = useState(() => initialAlerts ?? []);
  const [readAlertIds, setReadAlertIds] = useState(() => new Set());
  const [feedback, setFeedback] = useState(null);
  const [profile, setProfile] = useState(initialProfile);
  const displayProfile = initialProfile?.name ? initialProfile : profile;
  const alertReadStorageKey = useMemo(() => getAlertReadStorageKey(displayProfile), [displayProfile]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const stored =
        window.localStorage.getItem(alertReadStorageKey) ||
        window.localStorage.getItem(ALERT_READ_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      if (Array.isArray(parsed)) {
        const nextReadIds = new Set(parsed.filter((id) => typeof id === "string" && id.length > 0));
        setReadAlertIds(nextReadIds);

        if (alertReadStorageKey !== ALERT_READ_STORAGE_KEY) {
          window.localStorage.setItem(alertReadStorageKey, JSON.stringify([...nextReadIds]));
        }
      }
    } catch {
      setReadAlertIds(new Set());
    }
  }, [alertReadStorageKey]);

  useEffect(() => {
    if (initialAlerts !== undefined) {
      setAlerts(initialAlerts ?? []);
    }
  }, [initialAlerts]);

  useEffect(() => {
    if (initialProfile?.name) {
      setProfile((current) => current?.name ? current : initialProfile);
    }
  }, [initialProfile]);

  useEffect(() => {
    if (!hasAuthQuery(searchParams) || initialAlerts !== undefined) {
      return;
    }

    let active = true;

    fetch(buildAuthUrl("/api/dashboard/alerts", searchParams), {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (active && data.success) {
          setAlerts(data.data ?? []);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [initialAlerts, searchParams]);

  useEffect(() => {
    if (!hasAuthQuery(searchParams) || initialProfile?.name) {
      return;
    }

    let active = true;

    fetch(buildAuthUrl("/api/me", searchParams), {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (!active) {
          return;
        }

        if (data.success && data.data?.name) {
          setProfile(data.data);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [initialProfile, searchParams]);

  const unreadAlerts = useMemo(
    () => alerts.filter((alert) => !readAlertIds.has(alert.id)),
    [alerts, readAlertIds]
  );

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
      if (alertsRef.current && !alertsRef.current.contains(event.target)) {
        setAlertsOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setAlertsOpen(false);
      }
    }

    function handleOpenCreateJobEvent() {
      setOpenCreateJob(true);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("hireveri:open-create-job", handleOpenCreateJobEvent);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("hireveri:open-create-job", handleOpenCreateJobEvent);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    function handleActionFeedback(event) {
      const nextFeedback = {
        title: event.detail?.title || "Action completed",
        message: event.detail?.message || "",
        tone: event.detail?.tone || "success",
      };

      setFeedback(nextFeedback);

      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }

      feedbackTimerRef.current = window.setTimeout(() => {
        setFeedback(null);
        feedbackTimerRef.current = null;
      }, 4200);
    }

    window.addEventListener(ACTION_FEEDBACK_EVENT, handleActionFeedback);

    return () => {
      window.removeEventListener(ACTION_FEEDBACK_EVENT, handleActionFeedback);
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const initials = useMemo(() => {
    return (
      displayProfile?.name
        ?.split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "HR"
    );
  }, [displayProfile]);

  const handleLogout = () => {
    setProfileOpen(false);
    logoutRecruiter();
  };

  function persistReadAlertIds(nextReadIds) {
    setReadAlertIds(nextReadIds);

    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(alertReadStorageKey, JSON.stringify([...nextReadIds]));
    } catch {
      // Read state is a convenience layer; ignore storage failures.
    }
  }

  async function persistReadAlertsOnServer(alertIds) {
    if (!hasAuthQuery(searchParams) || alertIds.length === 0) {
      return;
    }

    try {
      await fetch(buildAuthUrl("/api/dashboard/alerts", searchParams), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alertIds }),
      });
    } catch {
      // Keep the immediate UI state; the next successful write will reconcile server read state.
    }
  }

  function handleMarkAlertRead(alertId) {
    const nextReadIds = new Set(readAlertIds);
    nextReadIds.add(alertId);
    persistReadAlertIds(nextReadIds);
    setAlerts((current) => current.filter((alert) => alert.id !== alertId));
    window.dispatchEvent(new CustomEvent(ALERTS_READ_EVENT, { detail: { alertIds: [alertId] } }));
    void persistReadAlertsOnServer([alertId]);
  }

  function handleMarkAllAlertsRead() {
    const nextReadIds = new Set(readAlertIds);
    const alertIds = unreadAlerts.map((alert) => alert.id);
    alertIds.forEach((alertId) => nextReadIds.add(alertId));
    persistReadAlertIds(nextReadIds);
    setAlerts((current) => current.filter((alert) => !alertIds.includes(alert.id)));
    window.dispatchEvent(new CustomEvent(ALERTS_READ_EVENT, { detail: { alertIds } }));
    void persistReadAlertsOnServer(alertIds);
  }

  const handleNavigationClick = (href) => {
    if (typeof window !== "undefined") {
      if (href === "/") {
        window.sessionStorage.removeItem("hireveri-overview");
      }
    }

    if (href === pathname) {
      return;
    }

    if (href === "/ai-screening") {
      return;
    }

    startLoading({ message: navLoadingMessages[href] || "Preparing recruiter insights...", reason: "navigation" });
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0c1424]/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1840px] flex-nowrap items-center justify-between gap-3 px-3 py-4 sm:px-4 xl:px-6">
          <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 xl:gap-3">
            <Link
              href={buildAuthUrl("/", searchParams)}
              onClick={() => handleNavigationClick("/")}
              className="flex w-[72px] shrink-0 flex-col justify-center leading-none sm:w-[180px] xl:w-[210px]"
              aria-label="HireVeri home"
            >
              <span className="text-lg font-semibold tracking-tight text-white xl:text-xl">HireVeri</span>
              <span className="mt-1 hidden whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.14em] text-blue-300/80 sm:block xl:tracking-[0.18em]">
                Cognitive Hiring System
              </span>
            </Link>

            <nav className="hidden min-w-0 flex-1 flex-nowrap items-center justify-start gap-0.5 overflow-visible md:flex xl:gap-1">
              {navItems.map((item) => {
                const active = isActivePath(pathname, item.href);

                return (
                  <Link
                    key={item.label}
                    href={buildAuthUrl(item.href, searchParams)}
                    onClick={() => handleNavigationClick(item.href)}
                    className={[
                      "whitespace-nowrap rounded-xl px-2 py-2 text-[13px] font-medium transition xl:px-2.5 xl:text-sm",
                      active
                        ? "border border-slate-700 bg-slate-800/90 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                        : "border border-transparent text-slate-300 hover:border-slate-800 hover:bg-slate-900/60 hover:text-white",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <div className="relative mr-3 shrink-0" ref={alertsRef}>
                <button
                  type="button"
                  onClick={() => setAlertsOpen((value) => !value)}
                  className={[
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border px-2 py-2 text-[13px] font-medium transition xl:px-2.5 xl:text-sm",
                    alertsOpen
                      ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-100"
                      : "border border-transparent text-slate-300 hover:border-slate-800 hover:bg-slate-900/60 hover:text-white",
                  ].join(" ")}
                >
                  Alerts
                  {unreadAlerts.length > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/20 px-1 text-[10px] font-semibold leading-none text-cyan-100">
                      {unreadAlerts.length > 9 ? "9+" : unreadAlerts.length}
                    </span>
                  ) : null}
                </button>

                {alertsOpen ? (
                  <div className="absolute right-0 top-[calc(100%+14px)] z-50 w-[360px] overflow-hidden rounded-2xl border border-slate-800 bg-[#10192c]/98 p-4 shadow-[0_24px_70px_rgba(2,6,23,0.55)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold text-white">Alerts</h2>
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Interview Activity</p>
                      </div>
                      {unreadAlerts.length > 0 ? (
                        <button
                          type="button"
                          onClick={handleMarkAllAlertsRead}
                          className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-500/20"
                        >
                          Mark all as read
                        </button>
                      ) : null}
                    </div>

                    <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                      {unreadAlerts.length === 0 ? (
                        <div className="rounded-2xl border border-slate-800 bg-slate-950/35 px-4 py-5 text-sm text-slate-400">
                          No unread interview activity alerts.
                        </div>
                      ) : (
                        unreadAlerts.slice(0, 8).map((alert) => (
                          <article key={alert.id} className={`rounded-2xl border px-4 py-3 ${getAlertToneClass(alert.tone)}`}>
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-semibold text-white">{alert.title}</p>
                              <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-slate-300">
                                {formatAlertTime(alert.occurredAt)}
                              </span>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-200">{alert.message}</p>
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => handleMarkAlertRead(alert.id)}
                                className="rounded-lg border border-white/10 bg-slate-950/30 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/35 hover:bg-cyan-500/10 hover:text-cyan-100"
                              >
                                Read
                              </button>
                            </div>
                          </article>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </nav>
          </div>

          <div className="ml-1 flex shrink-0 flex-nowrap items-center gap-2">
            <button onClick={() => setOpenCreateJob(true)} className="whitespace-nowrap rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white xl:px-3 xl:py-2">
              Create Job
            </button>

            <button
              onClick={() => onSendInterviewClick?.()}
              className="hidden whitespace-nowrap rounded-lg border border-blue-400/25 bg-transparent px-2.5 py-1.5 text-xs font-medium text-blue-300/90 transition hover:border-blue-300/60 hover:bg-blue-500/10 hover:text-white min-[380px]:inline-flex xl:px-3 xl:py-2"
            >
              Send Interview Link
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((value) => !value)}
                className="flex items-center gap-2 rounded-2xl border border-slate-700/80 bg-slate-900/85 px-2.5 py-2 transition hover:border-blue-400/40 hover:bg-slate-900 lg:gap-3 lg:px-3"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-sm font-semibold text-blue-300 lg:h-10 lg:w-10">
                  {initials}
                </div>
                <div className="hidden min-w-0 text-left 2xl:block">
                  <div className="max-w-[120px] truncate text-sm font-semibold text-white">{displayProfile?.name || "Recruiter"}</div>
                  <div className="max-w-[140px] truncate text-xs text-slate-400">{displayProfile?.organization || "Workspace"}</div>
                </div>
              </button>

              {profileOpen ? (
                <div className="absolute right-0 top-[calc(100%+12px)] z-50 w-[260px] overflow-hidden rounded-2xl border border-slate-800 bg-[#10192c]/98 p-2 shadow-[0_20px_60px_rgba(2,6,23,0.45)]">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/35 px-4 py-3">
                    <div className="text-sm font-semibold text-white">{displayProfile?.name || "Recruiter"}</div>
                    <div className="mt-1 text-xs text-slate-400">{displayProfile?.organization || "Authenticated workspace"}</div>
                  </div>

                  <div className="mt-2 grid gap-1">
                    <Link href={buildAuthUrl("/manage-team", searchParams)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-200 transition hover:bg-slate-800/70 hover:text-white" onClick={() => { setProfileOpen(false); handleNavigationClick("/manage-team"); }}>
                      <TeamIcon />
                      <span>Manage Team</span>
                    </Link>

                    <Link href={buildAuthUrl("/billing", searchParams)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-200 transition hover:bg-slate-800/70 hover:text-white" onClick={() => { setProfileOpen(false); handleNavigationClick("/billing"); }}>
                      <BillingIcon />
                      <span>Billing & Orders</span>
                    </Link>

                    <Link href={buildAuthUrl("/billing#usage", searchParams)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-200 transition hover:bg-slate-800/70 hover:text-white" onClick={() => { setProfileOpen(false); handleNavigationClick("/billing"); }}>
                      <CreditsIcon />
                      <span>Usage & Credits</span>
                    </Link>

                    <Link href={buildAuthUrl("/settings", searchParams)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-200 transition hover:bg-slate-800/70 hover:text-white" onClick={() => { setProfileOpen(false); handleNavigationClick("/settings"); }}>
                      <CogIcon />
                      <span>Settings</span>
                    </Link>

                    <Link href={buildAuthUrl("/contact-us", searchParams)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-200 transition hover:bg-slate-800/70 hover:text-white" onClick={() => { setProfileOpen(false); handleNavigationClick("/contact-us"); }}>
                      <MailIcon />
                      <span>Contact Us</span>
                    </Link>

                    <button type="button" onClick={handleLogout} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-rose-200 transition hover:bg-rose-500/10 hover:text-rose-100">
                      <LogoutIcon />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {feedback ? (
        <div className="fixed right-4 top-20 z-[90] w-[min(420px,calc(100vw-2rem))]">
          <div className={`rounded-2xl border px-4 py-3 backdrop-blur-xl ${getFeedbackToneClass(feedback.tone)}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{feedback.title}</p>
                {feedback.message ? (
                  <p className="mt-1 text-sm leading-5 text-current/80">{feedback.message}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="shrink-0 rounded-lg border border-white/10 bg-slate-950/20 px-2 py-1 text-xs font-semibold text-white/80 transition hover:border-white/25 hover:bg-white/10 hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {openCreateJob ? <CreateJobModal open={openCreateJob} setOpen={setOpenCreateJob} /> : null}
    </>
  );
}
