type ForensicScanLoaderProps = {
  compact?: boolean
}

export default function ForensicScanLoader({ compact = false }: ForensicScanLoaderProps) {
  const rows = compact ? 4 : 6

  return (
    <div className="relative z-10 rounded-2xl border border-cyan-300/10 bg-slate-950/35 p-4" aria-hidden="true">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-2 w-24 rounded-full bg-cyan-300/30" />
        <div className="h-2 w-14 rounded-full bg-blue-300/20" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <span className="hv-ai-node h-2 w-2 rounded-full bg-cyan-300/70" style={{ animationDelay: `${index * 140}ms` }} />
            <span className="hv-ai-stream h-1.5 rounded-full bg-gradient-to-r from-cyan-300/40 via-blue-300/25 to-transparent" style={{ width: `${88 - index * 8}%`, animationDelay: `${index * 110}ms` }} />
          </div>
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((item) => (
          <div key={item} className="rounded-xl border border-slate-800 bg-slate-900/45 p-2">
            <div className="h-1.5 rounded-full bg-cyan-300/20" />
            <div className="mt-2 h-4 rounded-lg bg-slate-800/80" />
          </div>
        ))}
      </div>
    </div>
  )
}
