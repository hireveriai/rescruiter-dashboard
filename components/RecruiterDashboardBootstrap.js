"use client"

import { useEffect, useState } from "react"

import { buildAuthUrl } from "@/lib/client/auth-query"
import { clearHireveriSessionCookie, getRecruiterLoginUrl } from "@/lib/client/auth-session"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"
import { useOrgTimezone } from "@/components/OrgTimezoneProvider"

function WorkspaceShell({ tone = "loading", title, message, ctaLabel, onCtaClick }) {
  const isError = tone === "error"

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07101d] px-6 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.16),transparent_22%),radial-gradient(circle_at_82%_22%,rgba(59,130,246,0.12),transparent_20%),radial-gradient(circle_at_50%_100%,rgba(14,165,233,0.08),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:88px_88px]" />

      <div className="relative w-full max-w-3xl overflow-hidden rounded-[34px] border border-cyan-400/18 bg-[linear-gradient(180deg,rgba(8,15,30,0.96),rgba(9,17,33,0.92))] shadow-[0_0_120px_rgba(34,211,238,0.10)]">
        <div className="absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent" />
        <div className="absolute -left-12 top-16 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute -right-10 bottom-12 h-36 w-36 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative grid gap-10 px-8 py-10 md:grid-cols-[1.15fr_0.85fr] md:px-12 md:py-12">
          <div>
            <p className="text-[11px] uppercase tracking-[0.45em] text-cyan-300/80">
              Recruiter Workspace
            </p>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-tight text-white md:text-5xl">
              {title}
            </h1>
            <p className={`mt-5 max-w-xl text-base leading-7 ${isError ? "text-amber-100/90" : "text-slate-300"}`}>
              {message}
            </p>

            {isError ? (
              <button
                type="button"
                className="mt-8 rounded-2xl border border-slate-700 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                onClick={onCtaClick}
              >
                {ctaLabel}
              </button>
            ) : (
              <div className="mt-8 flex items-center gap-3 text-sm text-slate-400">
                <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.9)]" />
                Authenticating recruiter context and preparing interview operations.
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500">Status</p>
                <p className="mt-2 text-lg font-medium text-white">
                  {isError ? "Access Interrupted" : "Secure Handshake"}
                </p>
              </div>
              <div className={`flex h-16 w-16 items-center justify-center rounded-2xl border ${isError ? "border-amber-400/20 bg-amber-500/10 text-amber-200" : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"}`}>
                <span className="text-xl font-semibold">{isError ? "!" : "HR"}</span>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {[
                isError ? "Session validation blocked" : "Identity confirmed",
                isError ? "Workspace bootstrap halted" : "Organization scope attached",
                isError ? "Manual re-entry required" : "Dashboard services warming up",
              ].map((item, index) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-slate-950/35 px-4 py-3 text-sm text-slate-300">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs ${isError ? "border-amber-400/20 bg-amber-500/10 text-amber-200" : "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"}`}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RecruiterDashboardBootstrap({ children }) {
  const searchParams = useAuthSearchParams()
  const { setTimezoneState } = useOrgTimezone()
  const [state, setState] = useState({
    status: "loading",
    profile: null,
    overview: null,
    message: "",
  })

  useEffect(() => {
    let active = true
    let cachedOverview = null
    let profileReady = false

    if (typeof window !== "undefined") {
      try {
        const cached = window.sessionStorage.getItem("hireveri-overview")
        cachedOverview = cached ? JSON.parse(cached) : null
      } catch (error) {
        console.warn("Failed to read cached recruiter overview", error)
      }
    }

    if (cachedOverview) {
      setState((current) => ({
        status: "ready",
        profile: cachedOverview?.profile ?? current.profile,
        overview: cachedOverview,
        message: "",
      }))
    }

    async function bootstrap({ forceRefresh = false } = {}) {
      if (!cachedOverview) {
        setState((current) => ({
          status: "loading",
          profile: current.profile,
          overview: current.overview,
          message: "",
        }))
      }

      try {
        const profilePromise = fetch(buildAuthUrl("/api/me", searchParams), {
          credentials: "include",
          cache: "no-store",
        })

        const overviewPath = `/api/dashboard/overview?refresh=${Date.now()}`
        const overviewPromise = fetch(buildAuthUrl(overviewPath, searchParams), {
          credentials: "include",
          cache: "no-store",
        })

        const profileResponse = await profilePromise
        const profileData = await profileResponse.json().catch(() => null)

        if (!active) {
          return
        }

        if (profileResponse.status === 401) {
          clearHireveriSessionCookie()
          setState({
            status: "error",
            profile: null,
            overview: null,
            message: "Session could not be validated. Please sign in again.",
          })
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem("hireveri-overview")
          }
          return
        }

        if (!profileResponse.ok || !profileData?.success) {
          if (profileResponse.status === 401) {
            clearHireveriSessionCookie()
          }
          setState({
            status: "error",
            profile: null,
            overview: null,
            message: profileData?.error?.message || profileData?.message || "Unable to load recruiter workspace.",
          })
          if (typeof window !== "undefined") {
            window.sessionStorage.removeItem("hireveri-overview")
          }
          return
        }

        const profile = profileData.data ?? null
        setTimezoneState({
          timezone: profile?.timezone,
          timezoneLabel: profile?.timezoneLabel,
        })

        setState((current) => ({
          status: "ready",
          profile,
          overview: current.overview,
          message: "",
        }))
        profileReady = true

        const overviewResponse = await overviewPromise
        const overviewData = await overviewResponse.json().catch(() => null)

        if (!active) {
          return
        }

        if (!overviewResponse.ok || !overviewData?.success) {
          console.warn("Dashboard overview refresh skipped", overviewData?.error?.message || overviewData?.message)
          return
        }

        const overview = overviewData.data ?? null

        if (typeof window !== "undefined" && overview) {
          try {
            if (forceRefresh) {
              window.sessionStorage.removeItem("hireveri-overview")
            }
            window.sessionStorage.setItem("hireveri-overview", JSON.stringify(overview))
          } catch (error) {
            console.warn("Failed to cache recruiter overview", error)
          }
        }

        setState({
          status: "ready",
          profile: overview?.profile ?? profile,
          overview,
          message: "",
        })
        setTimezoneState({
          timezone: overview?.profile?.timezone ?? profile?.timezone,
          timezoneLabel: overview?.profile?.timezoneLabel ?? profile?.timezoneLabel,
        })
      } catch (error) {
        if (!active) {
          return
        }

        if (profileReady) {
          console.warn("Dashboard overview refresh failed after profile load", error)
          return
        }

        setState({
          status: "error",
          profile: null,
          overview: null,
          message: "Unable to connect to the recruiter workspace.",
        })
      }
    }

    bootstrap()

    function handlePageShow(event) {
      if (!event.persisted) {
        return
      }

      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("hireveri-overview")
      }
      bootstrap({ forceRefresh: true })
    }

    if (typeof window !== "undefined") {
      window.addEventListener("pageshow", handlePageShow)
    }

    return () => {
      active = false
      if (typeof window !== "undefined") {
        window.removeEventListener("pageshow", handlePageShow)
      }
    }
  }, [searchParams])

  if (state.status === "error") {
    return (
      <WorkspaceShell
        tone="error"
        title="Workspace access blocked"
        message={state.message}
        ctaLabel="Go to Recruiter Login"
        onCtaClick={() => window.location.replace(getRecruiterLoginUrl())}
      />
    )
  }

  return children({
    profile: state.profile,
    overview: state.overview,
    restoreStatus: state.status,
    showRestoreOverlay: false,
  })
}

