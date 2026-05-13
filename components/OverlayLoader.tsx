"use client"

import { useEffect, useMemo, useState } from "react"

type OverlayLoaderProps = {
  visible: boolean
  title?: string
  messages?: string[]
  note?: string
  progress?: number | null
  intervalMs?: number
}

const DEFAULT_MESSAGES = [
  "Reconnecting to secure session...",
  "Validating recovery state...",
  "Rebuilding secure workspace context...",
]

export default function OverlayLoader({
  visible,
  title = "Restoring your workspace...",
  messages = DEFAULT_MESSAGES,
  note = "Critical recovery is in progress",
  progress = null,
  intervalMs = 1100,
}: OverlayLoaderProps) {
  const [activeIndex, setActiveIndex] = useState(0)

  const steps = useMemo(() => (messages.length > 0 ? messages : DEFAULT_MESSAGES), [messages])
  const clampedProgress =
    typeof progress === "number" ? Math.min(Math.max(progress, 0), 100) : null

  useEffect(() => {
    if (steps.length <= 1) {
      return
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % steps.length)
    }, intervalMs)

    return () => {
      window.clearInterval(timer)
    }
  }, [intervalMs, steps])

  if (!visible) {
    return null
  }

  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 px-6 backdrop-blur-md animate-[overlay-fade-in_200ms_ease-out_forwards]"
      role="status"
    >
      <div className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-[28px] border border-cyan-400/15 bg-[#08111d]/82 px-6 py-6 shadow-[0_24px_90px_rgba(8,145,178,0.16)] ring-1 ring-white/5 sm:px-7">
        <div
          aria-hidden="true"
          className="absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent"
        />
        <div
          aria-hidden="true"
          className="absolute -left-10 top-4 h-24 w-24 rounded-full bg-cyan-400/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -right-8 bottom-2 h-20 w-20 rounded-full bg-blue-500/10 blur-3xl"
        />

        <div
          className="relative flex items-start gap-4 animate-[overlay-panel-in_200ms_ease-out_forwards]"
        >
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 shadow-[0_0_35px_rgba(34,211,238,0.12)]">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-300/20 border-t-cyan-300" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.34em] text-cyan-200/70">
              Critical Recovery
            </p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-white sm:text-xl">
              {title}
            </h2>

            <div className="mt-4 space-y-2.5">
              {steps.map((message, index) => {
                const isActive = index === activeIndex

                return (
                  <div
                    key={`${message}-${index}`}
                    className={[
                      "flex items-center gap-3 text-sm transition-colors duration-300",
                      isActive ? "text-slate-100" : "text-slate-500",
                    ].join(" ")}
                  >
                    <span
                      aria-hidden="true"
                      className={[
                        "inline-flex h-2.5 w-2.5 rounded-full transition-all duration-300",
                        isActive
                          ? "bg-cyan-300 shadow-[0_0_18px_rgba(34,211,238,0.9)]"
                          : "bg-slate-700",
                      ].join(" ")}
                    />
                    <span>{message}</span>
                  </div>
                )
              })}
            </div>

            {clampedProgress !== null ? (
              <div className="mt-5">
                <div className="h-1 overflow-hidden rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,rgba(34,211,238,0.78),rgba(59,130,246,0.9))] transition-[width] duration-300"
                    style={{ width: `${clampedProgress}%` }}
                  />
                </div>
              </div>
            ) : null}

            <p className="mt-4 text-xs text-slate-400">{note}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
