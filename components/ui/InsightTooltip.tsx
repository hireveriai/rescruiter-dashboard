"use client"

import { type ReactNode, useId, useRef, useState } from "react"

type InsightTooltipProps = {
  text: string
  preview?: ReactNode
  showHint?: boolean
}

export function InsightTooltip({ text, preview, showHint = true }: InsightTooltipProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const tooltipId = useId()
  const insightText = text.trim() || "-"
  const hasInsight = insightText !== "-"

  function updatePosition() {
    const rect = buttonRef.current?.getBoundingClientRect()

    if (!rect) {
      return
    }

    const tooltipWidth = 336
    const viewportPadding = 16
    const left = Math.min(
      Math.max(rect.left, viewportPadding),
      window.innerWidth - tooltipWidth - viewportPadding
    )

    setPosition({
      left,
      top: rect.bottom + 8,
    })
  }

  function showTooltip() {
    if (!hasInsight) {
      return
    }

    updatePosition()
    setOpen(true)
  }

  return (
    <span className="relative block" onMouseEnter={showTooltip} onMouseLeave={() => setOpen(false)}>
      <button
        ref={buttonRef}
        type="button"
        className="block w-full cursor-pointer text-left"
        onClick={() => {
          if (open) {
            setOpen(false)
            return
          }

          showTooltip()
        }}
        onFocus={showTooltip}
        onBlur={() => setOpen(false)}
        aria-describedby={hasInsight ? tooltipId : undefined}
        aria-expanded={open}
        aria-label={hasInsight ? "View full insight" : "No insight available"}
        disabled={!hasInsight}
      >
        {preview ?? (
          <p className="line-clamp-2 text-sm leading-6 text-slate-400">
            {insightText}
          </p>
        )}

        {showHint && hasInsight ? (
          <span className="mt-1 block text-xs text-slate-600">Hover to view full insight</span>
        ) : null}
      </button>

      {hasInsight && open ? (
        <div
          id={tooltipId}
          role="tooltip"
          className="fixed z-[80] w-[21rem] max-w-[calc(100vw-2rem)] whitespace-pre-line rounded-lg border border-white/10 bg-[#0B1220] p-3 text-[12px] leading-[1.4] text-gray-200 shadow-xl"
          style={{ left: position.left, top: position.top }}
        >
          {insightText}
        </div>
      ) : null}
    </span>
  )
}
