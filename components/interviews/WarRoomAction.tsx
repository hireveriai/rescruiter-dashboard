"use client"

type WarRoomActionProps = {
  onOpen: () => void
  candidateName?: string
  compact?: boolean
}

export default function WarRoomAction({ onOpen, candidateName = "candidate", compact = false }: WarRoomActionProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group/war inline-flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border border-slate-700/90 bg-slate-950/40 text-left text-slate-200 transition duration-200 hover:border-blue-300/35 hover:bg-blue-500/10 hover:text-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-300/30 ${
        compact ? "px-4 py-3" : "px-4 py-3.5"
      }`}
      aria-label={`Open War Room forensic review for ${candidateName}`}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">Open War Room</span>
        <span className="mt-1 hidden truncate text-xs text-slate-400 transition group-hover/war:text-blue-100/75 sm:block">Behavioral telemetry & forensic analysis</span>
      </span>
      <span className="shrink-0 text-blue-200 transition group-hover/war:translate-x-0.5">→</span>
    </button>
  )
}
