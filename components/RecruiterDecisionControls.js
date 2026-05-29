"use client"

import { useState } from "react"

import { buildAuthUrl } from "@/lib/client/auth-query"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

const DECISIONS = [
  { status: "REVIEWED", label: "Reviewed", className: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100 hover:bg-cyan-400/15" },
  { status: "PROCEED", label: "Proceed", className: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15" },
  { status: "HOLD", label: "Hold", className: "border-amber-300/25 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15" },
  { status: "REJECT", label: "Reject", className: "border-rose-300/25 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15" },
]

function formatDecision(value) {
  if (!value) return "Pending Review"
  return String(value).toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

function getStatusClass(status) {
  if (status === "PROCEED") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
  if (status === "HOLD") return "border-amber-300/25 bg-amber-400/10 text-amber-100"
  if (status === "REJECT") return "border-rose-300/25 bg-rose-400/10 text-rose-100"
  if (status === "REVIEWED") return "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
  return "border-slate-600/70 bg-slate-950/30 text-slate-300"
}

export default function RecruiterDecisionControls({
  candidateId,
  interviewId = null,
  attemptId = null,
  initialStatus = null,
  disabled = false,
  onDecision,
  compact = false,
}) {
  const searchParams = useAuthSearchParams()
  const [status, setStatus] = useState(initialStatus)
  const [busyStatus, setBusyStatus] = useState("")
  const [error, setError] = useState("")

  async function updateDecision(nextStatus) {
    if (!candidateId || disabled) return

    const previousStatus = status
    setStatus(nextStatus)
    setBusyStatus(nextStatus)
    setError("")

    try {
      const response = await fetch(buildAuthUrl("/api/recruiter-decisions", searchParams), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, interviewId, attemptId, status: nextStatus }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error?.message || payload?.message || "Unable to save recruiter decision")
      }

      onDecision?.(payload.data)
    } catch (decisionError) {
      setStatus(previousStatus)
      setError(decisionError instanceof Error ? decisionError.message : "Unable to save recruiter decision")
    } finally {
      setBusyStatus("")
    }
  }

  return (
    <div className="min-w-0">
      <div className={`mb-2 inline-flex max-w-full rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${getStatusClass(status)}`}>
        <span className="truncate">{formatDecision(status)}</span>
      </div>
      <div className={`grid min-w-0 gap-1.5 ${compact ? "grid-cols-2" : "grid-cols-2 xl:grid-cols-4"}`}>
        {DECISIONS.map((decision) => (
          <button
            key={decision.status}
            type="button"
            onClick={() => updateDecision(decision.status)}
            disabled={disabled || Boolean(busyStatus)}
            className={`min-h-9 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-55 ${decision.className} ${
              status === decision.status ? "ring-1 ring-white/20" : ""
            }`}
          >
            {busyStatus === decision.status ? "Saving" : decision.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-2 text-xs leading-5 text-rose-200">{error}</p> : null}
    </div>
  )
}
