"use client"

type AISyncIndicatorProps = {
  visible?: boolean
  message?: string
}

export default function AISyncIndicator({
  visible = false,
  message = "Preparing recruiter insights...",
}: AISyncIndicatorProps) {
  return (
    <div
      className={[
        "pointer-events-none fixed right-4 top-[76px] z-[70] transition-all duration-300 sm:right-6",
        visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
      ].join(" ")}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="flex items-center gap-2 rounded-full border border-cyan-300/15 bg-[#0c1424]/92 px-3 py-2 text-xs text-slate-300 shadow-[0_12px_42px_rgba(2,6,23,0.28)] backdrop-blur-xl">
        <span className="h-2 w-2 rounded-full bg-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.7)]" />
        <span>{message}</span>
      </div>
    </div>
  )
}
