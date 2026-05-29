"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

import { buildAuthUrl } from "@/lib/client/auth-query"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

const DECISIONS = [
  { status: "REVIEWED", label: "Reviewed" },
  { status: "PROCEED", label: "Proceed" },
  { status: "HOLD", label: "Hold" },
  { status: "REJECT", label: "Reject" },
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
    if (!candidateId || disabled || busyStatus) return
    if (nextStatus === status) return

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
      <div className={`relative min-w-0 ${compact ? "max-w-[11rem]" : "max-w-[13rem]"}`}>
        <select
          value=""
          onChange={(event) => updateDecision(event.target.value)}
          disabled={disabled || Boolean(busyStatus)}
          aria-label="Recruiter decision action"
          className="h-10 w-full appearance-none rounded-xl border border-slate-700 bg-slate-950/70 px-3 pr-9 text-sm font-semibold text-slate-100 outline-none transition hover:border-cyan-300/50 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-55"
        >
          <option value="" disabled>
            {busyStatus ? "Saving..." : "Actions"}
          </option>
          {DECISIONS.map((decision) => (
            <option key={decision.status} value={decision.status}>
              {status === decision.status ? `${decision.label} (current)` : decision.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
      </div>
      {error ? <p className="mt-2 text-xs leading-5 text-rose-200">{error}</p> : null}
    </div>
  )
}
