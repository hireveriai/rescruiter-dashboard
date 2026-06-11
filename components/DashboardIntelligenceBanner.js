"use client";

import Link from "next/link";

import { canAccessFeature } from "@/lib/client/permissions";
import { deriveDashboardState } from "@/lib/dashboard/dashboard-state-engine";

function ActionButton({ href, onClick, children, tone = "primary" }) {
  const className =
    tone === "secondary"
      ? "inline-flex min-w-max items-center justify-center whitespace-nowrap rounded-xl border border-slate-700 bg-slate-950/45 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:bg-slate-900 hover:text-white"
      : "inline-flex min-w-max items-center justify-center whitespace-nowrap rounded-xl border border-cyan-400/25 bg-cyan-400/12 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/45 hover:bg-cyan-400/18 hover:text-white";

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {children}
      </button>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default function DashboardIntelligenceBanner({ overview, profile = null, onCreateJob, onSendInterview }) {
  const canCreateJob = canAccessFeature(profile, "createJob");
  const canSendInterview = canAccessFeature(profile, "sendInterview");
  const canUseAiScreening = canAccessFeature(profile, "aiScreening");

  if (!overview) {
    return (
      <section className="mb-4 overflow-hidden rounded-2xl border border-cyan-400/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.88),rgba(2,6,23,0.78))] px-5 py-4 shadow-[0_12px_34px_rgba(2,6,23,0.18)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300/80 shadow-[0_0_14px_rgba(34,211,238,0.65)]" />
            <p className="text-sm font-medium text-slate-100">Preparing recruiter workflow snapshot</p>
          </div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/70">Syncing</span>
        </div>
      </section>
    );
  }

  const state = deriveDashboardState(overview?.dashboardState ?? {});

  if (state.heroState === "WORKFLOW_ACTIVE") {
    const pendingCount = state.pending_reviews_count;
    const bannerText =
      pendingCount > 0
        ? `Hiring workflow active • ${pendingCount} candidate${pendingCount === 1 ? "" : "s"} pending review`
        : "Hiring workflow active • Evaluation pipeline is live";

    return (
      <section className="mb-4 overflow-hidden rounded-2xl border border-cyan-400/12 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.08),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.82))] px-5 py-4 shadow-[0_16px_44px_rgba(2,6,23,0.24)] transition-all duration-300">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.9)]" />
            <p className="text-sm font-medium text-slate-100">{bannerText}</p>
          </div>
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200/75">Operational</span>
        </div>
      </section>
    );
  }

  if (state.heroState === "VERIS_OPTIONAL") {
    return (
      <section className="mb-5 overflow-hidden rounded-[28px] border border-violet-400/14 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.14),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(6,11,24,0.94))] px-6 py-6 shadow-[0_20px_64px_rgba(2,6,23,0.3)] transition-all duration-300 sm:px-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-200/75">Optional Screening Layer</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">Run VERIS Screening before outreach.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              Verify resumes against job requirements and surface skill alignment, early risk indicators, and shortlist guidance.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            {canUseAiScreening ? <ActionButton href="/ai-screening">Start VERIS Screening</ActionButton> : null}
            {canSendInterview && onSendInterview ? <ActionButton tone="secondary" onClick={onSendInterview}>Skip & Continue Interviews</ActionButton> : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-5 overflow-hidden rounded-[28px] border border-cyan-400/14 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(6,11,24,0.94))] px-6 py-6 shadow-[0_20px_64px_rgba(2,6,23,0.3)] transition-all duration-300 sm:px-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-200/75">HireVeri Workflow</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">Start by creating a job and inviting candidates.</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
            Create a job and begin candidate evaluation.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          {canCreateJob && onCreateJob ? <ActionButton onClick={onCreateJob}>Create Job</ActionButton> : null}
        </div>
      </div>
    </section>
  );
}
