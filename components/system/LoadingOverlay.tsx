type LoadingOverlayProps = {
  visible: boolean
  title?: string
  message?: string
}

export default function LoadingOverlay({
  visible,
  title = "Processing request",
  message = "Keeping the workspace responsive while this isolated action completes.",
}: LoadingOverlayProps) {
  if (!visible) {
    return null
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-cyan-300/20 bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(8,17,31,0.98))] p-6 text-white shadow-[0_0_90px_rgba(34,211,238,0.14)]">
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
        <div className="flex items-start gap-4">
          <div className="hireveri-skeleton h-12 w-12 shrink-0 rounded-2xl border border-cyan-300/20 bg-cyan-400/10" />
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">{message}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
