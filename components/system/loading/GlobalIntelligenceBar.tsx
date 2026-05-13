"use client"

type GlobalIntelligenceBarProps = {
  active?: boolean
  visible?: boolean
  message?: string
}

export default function GlobalIntelligenceBar({
  active = false,
  visible = false,
  message = "Preparing recruiter insights...",
}: GlobalIntelligenceBarProps) {
  return (
    <div
      className={[
        "pointer-events-none fixed inset-x-0 top-[72px] z-[39] transition-opacity duration-300",
        active ? "opacity-100" : "opacity-0",
      ].join(" ")}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="h-px bg-cyan-300/10" />
      <div className={["h-1 overflow-hidden bg-slate-950/35", visible ? "opacity-100" : "opacity-40"].join(" ")}>
        <div className="hv-intelligence-bar h-full w-1/2 rounded-r-full bg-[linear-gradient(90deg,rgba(34,211,238,0),rgba(34,211,238,0.9),rgba(59,130,246,0.95),rgba(34,211,238,0))] shadow-[0_0_18px_rgba(34,211,238,0.45)]" />
      </div>
      <span className="sr-only">{message}</span>
    </div>
  )
}
