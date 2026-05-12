type IntelligenceStatusProps = {
  transcriptPreview?: string | null
  hasRecording?: boolean
  compact?: boolean
}

function hasTranscript(transcriptPreview?: string | null) {
  const value = String(transcriptPreview ?? "").trim()
  return Boolean(value && !/^transcript not available yet$/i.test(value))
}

export default function IntelligenceStatus({ transcriptPreview, hasRecording = true, compact = false }: IntelligenceStatusProps) {
  const transcriptReady = hasTranscript(transcriptPreview)
  const statuses = [
    {
      label: transcriptReady ? "Transcript Ready" : "Transcript Processing",
      ready: transcriptReady,
      pendingText: "AI transcription in progress",
    },
    {
      label: hasRecording ? "Cognitive Timeline Available" : "Cognitive Timeline Pending",
      ready: hasRecording,
      pendingText: "Timeline waits for replay evidence",
    },
    {
      label: "Behavioral Signals Ready",
      ready: true,
      pendingText: "",
    },
    {
      label: transcriptReady ? "AI Insight Readiness" : "Cognitive analysis pending",
      ready: transcriptReady,
      pendingText: "Insights unlock after transcript processing",
    },
  ]

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-slate-950/35 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Intelligence State</p>
        <span className="hv-ai-node h-1.5 w-1.5 rounded-full bg-cyan-300/80" />
      </div>
      <div className={`grid gap-2 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        {statuses.map((status) => (
          <div key={status.label} className="flex min-w-0 items-start gap-2">
            <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] ${
              status.ready
                ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
                : "hv-ai-node border-amber-400/25 bg-amber-500/10 text-amber-200"
            }`}>
              {status.ready ? "✓" : "●"}
            </span>
            <span className="min-w-0">
              <span className={`block truncate text-xs ${status.ready ? "text-slate-200" : "text-amber-100"}`}>{status.label}</span>
              {!status.ready && status.pendingText ? <span className="mt-0.5 block truncate text-[11px] text-slate-500">{status.pendingText}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
