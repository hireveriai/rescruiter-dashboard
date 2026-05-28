"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart3,
  BrainCircuit,
  ClipboardList,
  Link2,
  Search,
  ShieldAlert,
  Sparkles,
  SquarePlus,
  Users,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { buildAuthUrl } from "@/lib/client/auth-query";
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params";
import DockItem from "./DockItem";

type DashboardAlert = {
  id?: string;
  title?: string;
  message?: string;
  tone?: string;
  type?: string;
};

type CognitiveDockProps = {
  activeInterviewCount?: number;
  candidateCount?: number;
  flaggedCount?: number;
  alerts?: DashboardAlert[];
  onSendInterviewClick?: () => void;
};

type PanelMode = "search" | "alerts" | "copilot" | null;

function getPanelTitle(panel: PanelMode) {
  if (panel === "search") return "Universal Search";
  if (panel === "alerts") return "Fraud Alerts";
  if (panel === "copilot") return "VERIS Copilot";
  return "";
}

export default function CognitiveDock({
  activeInterviewCount = 0,
  candidateCount = 0,
  flaggedCount = 0,
  alerts = [],
  onSendInterviewClick,
}: CognitiveDockProps) {
  const pathname = usePathname();
  const searchParams = useAuthSearchParams();
  const [panel, setPanel] = useState<PanelMode>(null);

  const href = (path: string) => buildAuthUrl(path, searchParams);
  const hasFlaggedCandidates = flaggedCount > 0;

  const searchRows = useMemo(
    () => [
      { label: "Create a calibrated job", action: "Launch role configuration" },
      { label: "Send secure interview access", action: "Open quick invite" },
      { label: "Review active interviews", action: `${activeInterviewCount} in motion` },
      { label: "Open candidate queue", action: `${candidateCount} visible` },
    ],
    [activeInterviewCount, candidateCount]
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPanel("search");
      }

      if (event.key === "Escape") {
        setPanel(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const openCreateJob = () => {
    window.dispatchEvent(new CustomEvent("hireveri:open-create-job"));
  };

  const items = [
    {
      label: "Create Job",
      icon: SquarePlus,
      onClick: openCreateJob,
      active: false,
    },
    {
      label: "Send Interview Link",
      icon: Link2,
      onClick: onSendInterviewClick,
      active: false,
    },
    {
      label: "Active Interviews",
      icon: ClipboardList,
      href: href("/interviews"),
      badge: activeInterviewCount,
      active: pathname.startsWith("/interviews"),
    },
    {
      label: "Candidates Queue",
      icon: Users,
      href: href("/candidates"),
      active: pathname.startsWith("/candidates"),
    },
    {
      label: "Fraud Alerts",
      icon: ShieldAlert,
      onClick: () => setPanel("alerts"),
      badge: flaggedCount,
      alert: hasFlaggedCandidates,
      active: panel === "alerts",
    },
    {
      label: "Reports Snapshot",
      icon: BarChart3,
      href: href("/reports"),
      active: pathname.startsWith("/reports"),
    },
    {
      label: "Universal Search",
      icon: Search,
      onClick: () => setPanel("search"),
      active: panel === "search",
    },
    {
      label: "VERIS Copilot",
      icon: BrainCircuit,
      onClick: () => setPanel("copilot"),
      active: panel === "copilot",
    },
  ];

  return (
    <>
      <motion.aside
        initial={{ opacity: 0, x: -18, scale: 0.96 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 md:bottom-auto md:left-4 md:top-[calc(50%+44px)] md:-translate-x-0 md:-translate-y-1/2 lg:left-5 xl:left-6"
        aria-label="Cognitive Operations Dock"
      >
        <div className="relative rounded-[30px] border border-cyan-500/10 bg-[#071226]/58 p-1 shadow-[0_18px_60px_rgba(2,6,23,0.42),0_0_30px_rgba(34,211,238,0.06)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 rounded-[30px] bg-[linear-gradient(180deg,rgba(255,255,255,0.055),transparent_32%),radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.09),transparent_44%)]" />
          <motion.nav
            className="relative flex max-w-[calc(100vw-2rem)] items-center gap-1 overflow-x-auto md:max-h-[calc(100dvh-10rem)] md:max-w-none md:flex-col md:gap-1 md:overflow-visible xl:gap-1.5"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.045, delayChildren: 0.12 } },
            }}
          >
            {items.map((item) => (
              <motion.div
                key={item.label}
                variants={{
                  hidden: { opacity: 0, y: 8, scale: 0.92 },
                  visible: { opacity: 1, y: 0, scale: 1 },
                }}
                transition={{ duration: 0.24, ease: "easeOut" }}
              >
                <DockItem {...item} />
              </motion.div>
            ))}
          </motion.nav>
        </div>
      </motion.aside>

      <AnimatePresence>
        {panel ? (
          <motion.div
            className="fixed inset-0 z-[65] bg-slate-950/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPanel(null)}
          >
            <motion.section
              role="dialog"
              aria-label={getPanelTitle(panel)}
              className="absolute bottom-24 left-1/2 w-[min(92vw,520px)] -translate-x-1/2 overflow-hidden rounded-[28px] border border-cyan-400/15 bg-[#071226]/95 p-5 text-white shadow-[0_30px_100px_rgba(2,6,23,0.65),0_0_56px_rgba(34,211,238,0.12)] backdrop-blur-2xl md:bottom-auto md:left-24 md:top-1/2 md:translate-x-0 md:-translate-y-1/2"
              initial={{ opacity: 0, x: -10, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -10, scale: 0.97 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.13),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]" />
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/70">Cognitive Operations</p>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">{getPanelTitle(panel)}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPanel(null)}
                    className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-cyan-300/25 hover:bg-cyan-400/10 hover:text-white"
                    aria-label="Close panel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {panel === "search" ? (
                  <div className="mt-5">
                    <div className="flex items-center gap-3 rounded-2xl border border-cyan-400/15 bg-slate-950/55 px-4 py-3">
                      <Search className="h-4 w-4 text-cyan-200" />
                      <input
                        autoFocus
                        placeholder="Search jobs, candidates, interviews, reports"
                        className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                      />
                      <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-slate-400">Ctrl K</span>
                    </div>
                    <div className="mt-4 grid gap-2">
                      {searchRows.map((row) => (
                        <button
                          key={row.label}
                          type="button"
                          className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left transition hover:border-cyan-300/20 hover:bg-cyan-400/10"
                        >
                          <span className="text-sm font-medium text-slate-100">{row.label}</span>
                          <span className="text-xs text-cyan-200/70">{row.action}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {panel === "alerts" ? (
                  <div className="mt-5 space-y-3">
                    {hasFlaggedCandidates ? (
                      alerts.slice(0, 5).map((alert, index) => (
                        <article key={alert.id ?? `${alert.title}-${index}`} className="rounded-2xl border border-rose-300/15 bg-rose-500/[0.07] p-4">
                          <p className="text-sm font-semibold text-rose-50">{alert.title || "Candidate integrity signal"}</p>
                          <p className="mt-2 text-sm leading-6 text-rose-100/75">{alert.message || "Review flagged candidate activity before advancing the workflow."}</p>
                        </article>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-cyan-300/10 bg-cyan-400/[0.06] p-4">
                        <p className="text-sm font-semibold text-cyan-50">No active fraud alerts</p>
                        <p className="mt-2 text-sm leading-6 text-slate-300">Interview telemetry is quiet. New risk signals will surface here.</p>
                      </div>
                    )}
                  </div>
                ) : null}

                {panel === "copilot" ? (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-2xl border border-cyan-300/12 bg-cyan-400/[0.06] p-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.14)]">
                          <Sparkles className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-white">VERIS Copilot online</p>
                          <p className="mt-1 text-xs text-slate-400">Recruiter command layer ready.</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      {["Summarize active interviews", "Find high-risk candidate patterns", "Draft follow-up questions"].map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left text-sm text-slate-200 transition hover:border-cyan-300/20 hover:bg-cyan-400/10 hover:text-white"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
