"use client"

import { useState } from "react"

import UpgradeLimitDialog from "@/components/UpgradeLimitDialog"

const UPGRADE_MESSAGE =
  "You’ve reached your free trial limit. Upgrade your workspace to continue conducting interviews and screenings."

function Stat({ label, value, depleted }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${depleted ? "border-amber-400/25 bg-amber-500/10" : "border-cyan-400/15 bg-cyan-400/[0.06]"}`}>
      <p className={`text-xs font-medium uppercase tracking-[0.2em] ${depleted ? "text-amber-200/75" : "text-cyan-200/70"}`}>
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
    </div>
  )
}

export default function FreeTrialUsage({ credits }) {
  const [upgradeOpen, setUpgradeOpen] = useState(false)
  const hasCreditSnapshot =
    Number.isFinite(Number(credits?.interviewCreditsRemaining)) &&
    Number.isFinite(Number(credits?.screeningCreditsRemaining))
  const interviewCredits = hasCreditSnapshot ? Math.max(0, Number(credits.interviewCreditsRemaining)) : null
  const screeningCredits = hasCreditSnapshot ? Math.max(0, Number(credits.screeningCreditsRemaining)) : null
  const hasReachedLimit = hasCreditSnapshot && (interviewCredits === 0 || screeningCredits === 0)

  return (
    <section className="mb-5 rounded-[28px] border border-slate-800 bg-[#0f172a] p-5 shadow-[0_16px_54px_rgba(2,6,23,0.24)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Free Trial Remaining</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Free Trial Usage</h2>
        </div>
        {hasReachedLimit ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 sm:flex-row sm:items-center">
            <span>{credits?.upgradeMessage || UPGRADE_MESSAGE}</span>
            <button
              type="button"
              onClick={() => setUpgradeOpen(true)}
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-amber-200/35 bg-amber-300/12 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:border-amber-100/60 hover:bg-amber-300/18"
            >
              View Subscription Plans
            </button>
          </div>
        ) : null}
        {!hasCreditSnapshot ? (
          <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] px-4 py-3 text-sm text-cyan-100">
            Syncing trial usage...
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Stat label="AI Interviews Left" value={interviewCredits ?? "--"} depleted={interviewCredits === 0} />
        <Stat label="AI Screenings Left" value={screeningCredits ?? "--"} depleted={screeningCredits === 0} />
      </div>
      <UpgradeLimitDialog
        isOpen={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        credits={credits}
        message={credits?.upgradeMessage || UPGRADE_MESSAGE}
      />
    </section>
  )
}
