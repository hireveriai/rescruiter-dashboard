"use client"

import { useEffect, useState } from "react"

import { buildAuthUrl, hasAuthQuery } from "@/lib/client/auth-query"
import { getRecruiterLoginUrl } from "@/lib/client/auth-session"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

export default function RecruiterDashboardBootstrap({ children }) {
  const searchParams = useAuthSearchParams()
  const [state, setState] = useState({
    status: "loading",
    profile: null,
    message: "Establishing recruiter session...",
  })

  useEffect(() => {
    if (!hasAuthQuery(searchParams)) {
      setState({
        status: "loading",
        profile: null,
        message: "Resolving workspace access...",
      })
      return
    }

    let active = true

    async function bootstrap() {
      try {
        const response = await fetch(buildAuthUrl("/api/me", searchParams), {
          credentials: "include",
          cache: "no-store",
        })

        const data = await response.json().catch(() => null)

        if (!active) {
          return
        }

        if (response.status === 401) {
          window.location.replace(getRecruiterLoginUrl())
          return
        }

        if (!response.ok || !data?.success) {
          setState({
            status: "error",
            profile: null,
            message: data?.error?.message || data?.message || "Unable to load recruiter workspace.",
          })
          return
        }

        setState({
          status: "ready",
          profile: data.data ?? null,
          message: "",
        })
      } catch {
        if (!active) {
          return
        }

        setState({
          status: "error",
          profile: null,
          message: "Unable to connect to the recruiter workspace.",
        })
      }
    }

    bootstrap()

    return () => {
      active = false
    }
  }, [searchParams])

  if (state.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1220] px-6 text-white">
        <div className="w-full max-w-lg rounded-[28px] border border-slate-800 bg-[#0f172a] p-8 text-center shadow-[0_18px_60px_rgba(2,6,23,0.28)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/15 text-lg font-semibold text-blue-300">
            HR
          </div>
          <h1 className="mt-5 text-2xl font-semibold">Loading recruiter workspace</h1>
          <p className="mt-3 text-sm text-slate-400">{state.message}</p>
        </div>
      </div>
    )
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0b1220] px-6 text-white">
        <div className="w-full max-w-lg rounded-[28px] border border-amber-500/20 bg-[#0f172a] p-8 text-center shadow-[0_18px_60px_rgba(2,6,23,0.28)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-lg font-semibold text-amber-300">
            !
          </div>
          <h1 className="mt-5 text-2xl font-semibold">Workspace access blocked</h1>
          <p className="mt-3 text-sm text-amber-100/85">{state.message}</p>
          <button
            type="button"
            className="mt-6 rounded-xl border border-slate-700 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            onClick={() => window.location.replace(getRecruiterLoginUrl())}
          >
            Go to Recruiter Login
          </button>
        </div>
      </div>
    )
  }

  return children(state.profile)
}
