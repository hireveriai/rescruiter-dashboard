"use client"

import Link from "next/link"

import { buildAuthUrl } from "@/lib/client/auth-query"

const stepThemes = {
  blue: {
    glow: "shadow-[0_0_34px_rgba(59,130,246,0.16)]",
    border: "border-blue-400/35",
    text: "text-blue-200",
    indicator: "bg-blue-400",
    background: "from-blue-500/18 via-blue-500/8 to-slate-950/30",
  },
  violet: {
    glow: "shadow-[0_0_36px_rgba(139,92,246,0.2)]",
    border: "border-violet-400/35",
    text: "text-violet-200",
    indicator: "bg-violet-400",
    background: "from-violet-500/18 via-fuchsia-500/8 to-slate-950/30",
  },
  cyan: {
    glow: "shadow-[0_0_34px_rgba(34,211,238,0.17)]",
    border: "border-cyan-400/35",
    text: "text-cyan-200",
    indicator: "bg-cyan-400",
    background: "from-cyan-500/18 via-sky-500/8 to-slate-950/30",
  },
  teal: {
    glow: "shadow-[0_0_34px_rgba(45,212,191,0.17)]",
    border: "border-teal-400/35",
    text: "text-teal-200",
    indicator: "bg-teal-400",
    background: "from-teal-500/18 via-emerald-500/8 to-slate-950/30",
  },
  amber: {
    glow: "shadow-[0_0_34px_rgba(245,158,11,0.17)]",
    border: "border-amber-300/35",
    text: "text-amber-200",
    indicator: "bg-amber-300",
    background: "from-amber-500/18 via-yellow-500/8 to-slate-950/30",
  },
  green: {
    glow: "shadow-[0_0_34px_rgba(34,197,94,0.17)]",
    border: "border-emerald-400/35",
    text: "text-emerald-200",
    indicator: "bg-emerald-400",
    background: "from-emerald-500/18 via-green-500/8 to-slate-950/30",
  },
}

const workflowSteps = [
  {
    id: "create-job",
    number: 1,
    title: "Create Job",
    description: "Define role, skills, interview duration, and hiring configuration.",
    cta: "Create Job",
    theme: "blue",
    action: "create-job",
  },
  {
    id: "veris-screening",
    number: 2,
    title: "VERIS Screening",
    description: "AI resume verification, profile matching, fraud checks, and candidate shortlisting.",
    cta: "Start Screening",
    secondaryCta: "Skip",
    theme: "violet",
    optional: true,
    href: "/ai-screening",
  },
  {
    id: "send-link",
    number: 3,
    title: "Send Interview Link",
    description: "Invite shortlisted candidates securely for AI interviews.",
    cta: "Send Interview Link",
    theme: "cyan",
    action: "send-link",
  },
  {
    id: "ai-interview",
    number: 4,
    title: "AI Interview",
    description: "Monitor cognitive interviews, live telemetry, and interview progress.",
    cta: "View Interviews",
    theme: "teal",
    href: "/interviews",
  },
  {
    id: "review-reports",
    number: 5,
    title: "Review Reports",
    description: "Analyze confidence signals, fraud indicators, cognitive insights, and AI recommendations.",
    cta: "Open Reports",
    theme: "amber",
    href: "/reports",
  },
  {
    id: "hiring-decision",
    number: 6,
    title: "Hiring Decision",
    description: "Approve, reject, or escalate candidates with full audit trail visibility.",
    cta: "Review Candidates",
    theme: "green",
    href: "/candidates",
  },
]

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function AiIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="m4.93 4.93 2.83 2.83" />
      <path d="m16.24 16.24 2.83 2.83" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="m4.93 19.07 2.83-2.83" />
      <path d="m16.24 7.76 2.83-2.83" />
      <circle cx="12" cy="12" r="3.4" />
    </svg>
  )
}

function getWorkflowState(overview) {
  const metrics = overview?.workflowMetrics ?? {}
  const pipeline = overview?.pipeline ?? {}
  const jobs = Number(metrics.jobs ?? 0)
  const invites = Number(metrics.invites ?? overview?.pendingInterviews?.length ?? 0)
  const screenings = Number(metrics.screenings ?? overview?.veris?.length ?? 0)
  const running = Number(metrics.interviewsRunning ?? pipeline.inProgress ?? 0)
  const reportsReady = Number(metrics.reportsReady ?? pipeline.completed ?? 0)
  const decisionsPending = Number(metrics.decisionsPending ?? 0)

  if (jobs <= 0) {
    return {
      activeStepId: "create-job",
      skippedOptional: false,
      message: "Start by creating your first job.",
    }
  }

  if (running > 0) {
    return {
      activeStepId: "ai-interview",
      skippedOptional: screenings <= 0 && invites > 0,
      message: `${running} interview${running === 1 ? " is" : "s are"} currently active.`,
    }
  }

  if (decisionsPending > 0) {
    return {
      activeStepId: "hiring-decision",
      skippedOptional: screenings <= 0 && invites > 0,
      message: `${decisionsPending} completed interview${decisionsPending === 1 ? " needs" : "s need"} a hiring decision.`,
    }
  }

  if (reportsReady > 0) {
    return {
      activeStepId: "review-reports",
      skippedOptional: screenings <= 0 && invites > 0,
      message: `${reportsReady} completed interview${reportsReady === 1 ? " is" : "s are"} ready for review.`,
    }
  }

  if (invites > 0) {
    return {
      activeStepId: "ai-interview",
      skippedOptional: screenings <= 0,
      message: "Interview links are out. Monitor starts, recovery signals, and live progress.",
    }
  }

  if (screenings > 0) {
    return {
      activeStepId: "send-link",
      skippedOptional: false,
      message: "Recommended: Send interview links to shortlisted candidates.",
    }
  }

  return {
    activeStepId: "veris-screening",
    skippedOptional: false,
    message: "Recommended: Run VERIS Screening before inviting candidates.",
  }
}

function getStepStatus(step, state) {
  const activeIndex = workflowSteps.findIndex((item) => item.id === state.activeStepId)
  const stepIndex = workflowSteps.findIndex((item) => item.id === step.id)

  if (step.optional && state.skippedOptional) return "skipped"
  if (step.id === state.activeStepId) return "active"
  if (stepIndex < activeIndex) return "completed"
  return "pending"
}

function WorkflowAction({ step, searchParams, onAction }) {
  const baseClass = "inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition duration-200 hover:border-white/25 hover:bg-white/15"

  if (step.href) {
    return (
      <Link href={buildAuthUrl(step.href, searchParams)} className={baseClass}>
        {step.cta}
      </Link>
    )
  }

  return (
    <button type="button" className={baseClass} onClick={() => onAction(step.action)}>
      {step.cta}
    </button>
  )
}

function WorkflowStepCard({ step, status, searchParams, onAction }) {
  const theme = stepThemes[step.theme]
  const isActive = status === "active"
  const isCompleted = status === "completed"
  const isSkipped = status === "skipped"
  const isPending = status === "pending"
  const cardClass = [
    "group relative overflow-hidden rounded-2xl border p-3.5 text-left transition duration-200 hover:-translate-y-0.5 hover:scale-[1.01]",
    isActive ? `${theme.border} bg-gradient-to-br ${theme.background} ${theme.glow} hiring-workflow-active` : "",
    isCompleted ? "border-emerald-400/20 bg-emerald-500/[0.045] text-slate-300" : "",
    isSkipped ? "border-violet-400/12 bg-slate-950/30 text-slate-500 opacity-70" : "",
    isPending ? "border-slate-800 bg-slate-950/35 text-slate-400 opacity-80" : "",
  ].join(" ")

  return (
    <div className={cardClass}>
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-30 ${theme.text}`} />
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div className={[
            "flex h-8 w-8 items-center justify-center rounded-xl border text-xs font-semibold transition",
            isActive ? `${theme.border} ${theme.text} bg-white/10 shadow-[0_0_18px_currentColor]` : "",
            isCompleted ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : "",
            isSkipped ? "border-violet-400/20 bg-violet-500/5 text-violet-300" : "",
            isPending ? "border-slate-700 bg-slate-900 text-slate-500" : "",
          ].join(" ")}>
            {isCompleted ? <CheckIcon /> : step.number}
          </div>
          {isActive ? <span className={`absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full ${theme.indicator} hiring-workflow-pulse`} /> : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold leading-tight text-white">{step.title}</p>
            {step.optional ? (
              <span className="rounded-full border border-violet-300/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200">
                Optional • AI Enhanced
              </span>
            ) : null}
            {isSkipped ? (
              <span className="rounded-full border border-slate-600 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Skipped
              </span>
            ) : null}
          </div>

          <p className="mt-2 text-[12px] leading-5 text-slate-400">{step.description}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <WorkflowAction step={step} searchParams={searchParams} onAction={onAction} />
            {step.secondaryCta ? (
              <button type="button" className="inline-flex items-center justify-center rounded-xl border border-violet-300/15 px-3 py-2 text-xs font-semibold text-violet-200 transition duration-200 hover:border-violet-300/35 hover:bg-violet-500/10" onClick={() => onAction("skip-screening")}>
                {step.secondaryCta}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HiringWorkflow({ overview, searchParams, onAction }) {
  const state = getWorkflowState(overview)

  return (
    <div className="mt-7">
      <h3 className="text-xs font-medium uppercase tracking-[0.34em] text-slate-500">Hiring Workflow</h3>

      <div className="mt-4 overflow-hidden rounded-2xl border border-cyan-300/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_38%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,0.84))] p-4 shadow-[0_18px_60px_rgba(2,6,23,0.3)]">
        <div className="flex items-start gap-3">
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.18)]">
            <AiIcon />
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-cyan-300 hiring-workflow-pulse" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200/80">AI Recommended Next Action</p>
            <p className="mt-2 text-sm leading-6 text-white">{state.message}</p>
          </div>
        </div>
      </div>

      <div className="relative mt-5 space-y-3 pl-3">
        <div className="absolute bottom-7 left-[28px] top-7 w-px overflow-hidden bg-slate-800">
          <div className="h-1/2 w-full bg-gradient-to-b from-blue-400 via-violet-400 to-cyan-300 hiring-workflow-flow" />
        </div>
        {workflowSteps.map((step) => (
          <div key={step.id} className="relative pl-8">
            <WorkflowStepCard step={step} status={getStepStatus(step, state)} searchParams={searchParams} onAction={onAction} />
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        <span>Start</span>
        <span>Process</span>
        <span>Decision</span>
      </div>
    </div>
  )
}
