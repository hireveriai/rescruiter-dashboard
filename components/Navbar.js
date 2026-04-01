"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { buildAuthUrl } from "@/lib/client/auth-query";
import { logoutRecruiter } from "@/lib/client/logout";
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params";

import CreateJobModal from "./CreateJobModal";

const navItems = [
  { href: "/", label: "Dashboard", disabled: false },
  { href: "/jobs", label: "Jobs", disabled: false },
  { href: "/candidates", label: "Candidates", disabled: false },
  { href: "/interviews", label: "Interviews", disabled: false },
  { href: "#", label: "Reports", disabled: true },
  { href: "#", label: "Alerts", disabled: true },
];

function isActivePath(pathname, href) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname.startsWith(href);
}

function CogIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1 .6 1.65 1.65 0 0 1-2 0 1.65 1.65 0 0 0-1-.6 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-.6-1 1.65 1.65 0 0 1 0-2 1.65 1.65 0 0 0 .6-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-.6 1.65 1.65 0 0 1 2 0 1.65 1.65 0 0 0 1 .6 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.24.32.44.67.6 1a1.65 1.65 0 0 1 0 2c-.16.33-.36.68-.6 1Z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export default function Navbar({ onSendInterviewClick }) {
  const pathname = usePathname();
  const searchParams = useAuthSearchParams();
  const menuRef = useRef(null);
  const [openCreateJob, setOpenCreateJob] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    let active = true;

    fetch(buildAuthUrl("/api/me", searchParams))
      .then((res) => res.json())
      .then((data) => {
        if (!active) {
          return;
        }

        if (data.success) {
          setProfile(data.data);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [searchParams]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setProfileOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const initials = useMemo(() => {
    return (
      profile?.name
        ?.split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "HR"
    );
  }, [profile]);

  const handleLogout = () => {
    setProfileOpen(false);
    logoutRecruiter();
  };

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0c1424]/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-5 lg:gap-9">
            <Link
              href={buildAuthUrl("/", searchParams)}
              className="shrink-0 text-[1.75rem] font-semibold tracking-tight text-slate-50"
            >
              Hire<span className="text-blue-400">Veri</span>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              {navItems.map((item) => {
                if (item.disabled) {
                  return (
                    <span
                      key={item.label}
                      className="rounded-xl border border-transparent px-4 py-2 text-[15px] text-slate-500"
                      aria-disabled="true"
                      title="Coming soon"
                    >
                      {item.label}
                    </span>
                  );
                }

                const active = isActivePath(pathname, item.href);

                return (
                  <Link
                    key={item.label}
                    href={buildAuthUrl(item.href, searchParams)}
                    className={[
                      "rounded-xl px-4 py-2 text-[15px] font-medium transition",
                      active
                        ? "border border-slate-700 bg-slate-800/90 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
                        : "border border-transparent text-slate-300 hover:border-slate-800 hover:bg-slate-900/60 hover:text-white",
                    ].join(" ")}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={() => setOpenCreateJob(true)}
              className="rounded-xl border border-slate-700 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              Create Job
            </button>

            <button
              onClick={() => onSendInterviewClick?.()}
              className="rounded-xl border border-blue-400/40 bg-transparent px-4 py-2.5 text-sm font-medium text-blue-300 transition hover:border-blue-300 hover:bg-blue-500/10 hover:text-white"
            >
              Send Interview Link
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((value) => !value)}
                className="flex items-center gap-3 rounded-2xl border border-slate-700/80 bg-slate-900/85 px-3 py-2 transition hover:border-blue-400/40 hover:bg-slate-900"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-sm font-semibold text-blue-300">
                  {initials}
                </div>
                <div className="hidden min-w-0 text-left xl:block">
                  <div className="max-w-[140px] truncate text-sm font-semibold text-white">
                    {profile?.name || "Recruiter"}
                  </div>
                  <div className="max-w-[140px] truncate text-xs text-slate-400">
                    {profile?.organization || "Workspace"}
                  </div>
                </div>
              </button>

              {profileOpen ? (
                <div className="absolute right-0 top-[calc(100%+12px)] w-[260px] overflow-hidden rounded-2xl border border-slate-800 bg-[#10192c]/98 p-2 shadow-[0_20px_60px_rgba(2,6,23,0.45)]">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/35 px-4 py-3">
                    <div className="text-sm font-semibold text-white">
                      {profile?.name || "Recruiter"}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {profile?.organization || "Authenticated workspace"}
                    </div>
                  </div>

                  <div className="mt-2 grid gap-1">
                    <Link
                      href={buildAuthUrl("/settings", searchParams)}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-200 transition hover:bg-slate-800/70 hover:text-white"
                      onClick={() => setProfileOpen(false)}
                    >
                      <CogIcon />
                      <span>Settings</span>
                    </Link>

                    <Link
                      href={buildAuthUrl("/contact-us", searchParams)}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-200 transition hover:bg-slate-800/70 hover:text-white"
                      onClick={() => setProfileOpen(false)}
                    >
                      <MailIcon />
                      <span>Contact Us</span>
                    </Link>

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-rose-200 transition hover:bg-rose-500/10 hover:text-rose-100"
                    >
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

      <CreateJobModal open={openCreateJob} setOpen={setOpenCreateJob} />
    </>
  );
}
