"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"

import AISyncIndicator from "./AISyncIndicator"
import GlobalIntelligenceBar from "./GlobalIntelligenceBar"

type LoadingReason = "navigation" | "dashboard" | "candidates" | "interviews" | "reports" | "veris" | "analytics"

type AmbientLoadingOptions = {
  message?: string
  reason?: LoadingReason
}

type AmbientLoadingContextValue = {
  startLoading: (options?: AmbientLoadingOptions) => void
  finishLoading: () => void
}

const AmbientLoadingContext = createContext<AmbientLoadingContextValue | null>(null)

const routeMessages: Array<[RegExp, string]> = [
  [/^\/candidates/, "Loading candidate pipeline..."],
  [/^\/interviews/, "Syncing interview telemetry..."],
  [/^\/reports/, "Updating forensic analytics..."],
  [/^\/jobs/, "Loading job intelligence..."],
  [/^\/manage-team/, "Syncing team workspace..."],
  [/^\/settings/, "Loading workspace settings..."],
  [/^\//, "Syncing recruiter dashboard..."],
]

function getRouteMessage(pathname: string) {
  return routeMessages.find(([pattern]) => pattern.test(pathname))?.[1] ?? "Preparing recruiter insights..."
}

function getAnchorFromEventTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null
  }

  return target.closest("a")
}

export function useAmbientLoading() {
  const context = useContext(AmbientLoadingContext)

  if (!context) {
    throw new Error("useAmbientLoading must be used inside AmbientLoadingProvider")
  }

  return context
}

export default function AmbientLoadingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [pending, setPending] = useState(false)
  const [visible, setVisible] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const [message, setMessage] = useState("Preparing recruiter insights...")
  const timers = useRef<number[]>([])
  const lastLocation = useRef("")

  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current = []
  }, [])

  const finishLoading = useCallback(() => {
    clearTimers()
    setPending(false)
    setShowDetails(false)
    const fadeTimer = window.setTimeout(() => setVisible(false), 280)
    timers.current.push(fadeTimer)
  }, [clearTimers])

  const startLoading = useCallback((options: AmbientLoadingOptions = {}) => {
    clearTimers()
    setMessage(options.message || getRouteMessage(window.location.pathname))
    setPending(true)
    setShowDetails(false)

    const barTimer = window.setTimeout(() => setVisible(true), 180)
    const detailTimer = window.setTimeout(() => setShowDetails(true), 2000)
    const safetyTimer = window.setTimeout(() => finishLoading(), 8000)
    timers.current.push(barTimer, detailTimer, safetyTimer)
  }, [clearTimers, finishLoading])

  useEffect(() => {
    const nextLocation = pathname

    if (!lastLocation.current) {
      lastLocation.current = nextLocation
      return
    }

    if (lastLocation.current !== nextLocation) {
      setMessage(getRouteMessage(pathname))
      finishLoading()
      lastLocation.current = nextLocation
    }
  }, [finishLoading, pathname])

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }

      const anchor = getAnchorFromEventTarget(event.target)
      if (!anchor || anchor.target || anchor.hasAttribute("download")) {
        return
      }

      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return
      }

      const nextUrl = new URL(anchor.href, window.location.href)
      const currentUrl = new URL(window.location.href)

      if (nextUrl.origin !== currentUrl.origin) {
        return
      }

      if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) {
        return
      }

      if (nextUrl.pathname.startsWith("/ai-screening")) {
        return
      }

      startLoading({ message: getRouteMessage(nextUrl.pathname), reason: "navigation" })
    }

    function handlePageShow() {
      finishLoading()
    }

    document.addEventListener("click", handleClick, true)
    window.addEventListener("pageshow", handlePageShow)

    return () => {
      document.removeEventListener("click", handleClick, true)
      window.removeEventListener("pageshow", handlePageShow)
      clearTimers()
    }
  }, [clearTimers, finishLoading, startLoading])

  const value = useMemo(() => ({ startLoading, finishLoading }), [finishLoading, startLoading])

  return (
    <AmbientLoadingContext.Provider value={value}>
      <GlobalIntelligenceBar active={pending} visible={visible} message={message} />
      <AISyncIndicator visible={visible && showDetails} message={message} />
      <div className="hv-route-continuity">{children}</div>
    </AmbientLoadingContext.Provider>
  )
}
