"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

import { buildAuthUrl } from "@/lib/client/auth-query";

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

export default function Navbar({ onSendInterviewClick }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [openCreateJob, setOpenCreateJob] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0c1424]/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-6 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-6 lg:gap-10">
            <Link href={buildAuthUrl("/", searchParams)} className="shrink-0 text-[1.75rem] font-semibold tracking-tight text-slate-50">
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
              className="rounded-xl border border-slate-700 bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              Create Job
            </button>

            <button
              onClick={() => onSendInterviewClick?.()}
              className="rounded-xl border border-blue-400/40 bg-transparent px-4 py-2.5 text-sm font-medium text-blue-300 transition hover:border-blue-300 hover:bg-blue-500/10 hover:text-white"
            >
              Send Interview Link
            </button>
          </div>
        </div>
      </header>

      <CreateJobModal open={openCreateJob} setOpen={setOpenCreateJob} />
    </>
  );
}
