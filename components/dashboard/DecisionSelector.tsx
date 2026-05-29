"use client"

import { motion } from "framer-motion"
import { CheckCircle2, CirclePause, ShieldAlert, TrendingUp } from "lucide-react"

export type RecruiterDecisionStatus = "PROCEED" | "HOLD" | "REJECT" | "REVIEW_REQUIRED"

type DecisionSelectorProps = {
  value: RecruiterDecisionStatus
  onChange: (value: RecruiterDecisionStatus) => void
  disabled?: boolean
}

const DECISIONS: Array<{
  value: RecruiterDecisionStatus
  title: string
  description: string
  Icon: typeof TrendingUp
  activeClassName: string
}> = [
  {
    value: "PROCEED",
    title: "Proceed",
    description: "Advance candidate to the next hiring step.",
    Icon: TrendingUp,
    activeClassName: "border-emerald-300/45 bg-emerald-400/12 text-emerald-50 shadow-[0_0_26px_rgba(16,185,129,0.12)]",
  },
  {
    value: "HOLD",
    title: "Hold",
    description: "Keep warm while more context is gathered.",
    Icon: CirclePause,
    activeClassName: "border-amber-300/45 bg-amber-400/12 text-amber-50 shadow-[0_0_26px_rgba(245,158,11,0.10)]",
  },
  {
    value: "REJECT",
    title: "Reject",
    description: "Close the workflow for this candidate.",
    Icon: ShieldAlert,
    activeClassName: "border-rose-300/35 bg-rose-400/12 text-rose-50 shadow-[0_0_26px_rgba(244,63,94,0.10)]",
  },
  {
    value: "REVIEW_REQUIRED",
    title: "Escalate Review",
    description: "Route to deeper stakeholder review.",
    Icon: CheckCircle2,
    activeClassName: "border-sky-300/40 bg-sky-400/12 text-sky-50 shadow-[0_0_26px_rgba(56,189,248,0.10)]",
  },
]

export function DecisionSelector({ value, onChange, disabled = false }: DecisionSelectorProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {DECISIONS.map(({ value: optionValue, title, description, Icon, activeClassName }) => {
        const selected = value === optionValue

        return (
          <motion.button
            key={optionValue}
            type="button"
            whileHover={disabled ? undefined : { y: -1 }}
            whileTap={disabled ? undefined : { scale: 0.99 }}
            onClick={() => onChange(optionValue)}
            disabled={disabled}
            className={`group min-h-28 rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
              selected
                ? activeClassName
                : "border-slate-700/80 bg-slate-950/35 text-slate-300 hover:border-cyan-300/25 hover:bg-cyan-400/5 hover:text-slate-100"
            }`}
            aria-pressed={selected}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span
                className={`mt-1 h-3 w-3 rounded-full border transition ${
                  selected ? "border-white/50 bg-white/80" : "border-slate-500 bg-transparent group-hover:border-cyan-200/50"
                }`}
                aria-hidden="true"
              />
            </span>
            <span className="mt-4 block text-sm font-semibold text-white">{title}</span>
            <span className="mt-1.5 block text-xs leading-5 text-slate-400">{description}</span>
          </motion.button>
        )
      })}
    </div>
  )
}
