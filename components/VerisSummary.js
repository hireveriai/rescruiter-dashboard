"use client"

import { useEffect, useState } from "react"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

import { buildAuthUrl, hasAuthQuery } from "@/lib/client/auth-query"
import { CardSkeleton, TimelineSkeleton } from "@/components/system/skeletons"

const DASHBOARD_SUMMARY_LIMIT = 4

function getRecommendationColor(value) {
  const normalized = String(value ?? "").toUpperCase()

  if (normalized === "STRONG HIRE" || normalized === "HIRE") {
    return "text-green-400"
  }

  if (normalized === "HOLD" || normalized === "REVIEW REQUIRED") {
    return "text-yellow-400"
  }

  return "text-red-400"
}

function getRiskColor(value) {
  const normalized = String(value ?? "").toUpperCase()

  if (normalized === "LOW") {
    return "text-green-400"
  }

  if (normalized === "MEDIUM") {
    return "text-yellow-400"
  }

  return "text-red-400"
}

export default function VerisSummary({ initialSummaries, isLoading = false }) {
  const searchParams = useAuthSearchParams()
  const [summaries, setSummaries] = useState([])
  const [allSummaries, setAllSummaries] = useState(null)
  const [showAll, setShowAll] = useState(false)
  const [isLoadingAll, setIsLoadingAll] = useState(false)
  const [loadAllError, setLoadAllError] = useState("")
  const baseSummaries = initialSummaries !== undefined ? initialSummaries : summaries
  const displaySummaries = showAll ? allSummaries ?? baseSummaries : baseSummaries.slice(0, DASHBOARD_SUMMARY_LIMIT)
  const hasMoreSummaries = showAll
    ? displaySummaries.length > DASHBOARD_SUMMARY_LIMIT
    : baseSummaries.length > DASHBOARD_SUMMARY_LIMIT

  useEffect(() => {
    if (initialSummaries !== undefined) {
      return
    }

    if (!hasAuthQuery(searchParams)) {
      return
    }

    let isMounted = true

    fetch(buildAuthUrl("/api/dashboard/veris", searchParams), {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setSummaries(data.data ?? [])
        }
      })
      .catch((error) => {
        console.error("Failed to fetch VERIS summaries", error)
      })

    return () => {
      isMounted = false
    }
  }, [initialSummaries, searchParams])

  async function handleViewAll() {
    if (showAll) {
      setShowAll(false)
      setLoadAllError("")
      return
    }

    if (allSummaries) {
      setShowAll(true)
      return
    }

    try {
      setIsLoadingAll(true)
      setLoadAllError("")
      const response = await fetch(buildAuthUrl("/api/dashboard/veris?limit=all", searchParams), {
        credentials: "include",
        cache: "no-store",
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data?.error?.message || data?.message || "Unable to load all VERIS summaries")
      }

      setAllSummaries(data.data ?? [])
      setShowAll(true)
    } catch (error) {
      setLoadAllError(error instanceof Error ? error.message : "Unable to load all VERIS summaries")
    } finally {
      setIsLoadingAll(false)
    }
  }

  return (
    <div className="mt-10">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            VERIS AI Summaries
            <span className="ml-2 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 align-middle text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              Recent
            </span>
          </h2>
          {!isLoading ? (
            <p className="mt-1 text-sm text-slate-500">
              Showing {displaySummaries.length} of {showAll ? displaySummaries.length : baseSummaries.length} summaries
            </p>
          ) : null}
        </div>

        {hasMoreSummaries || showAll ? (
          <button
            type="button"
            onClick={handleViewAll}
            disabled={isLoadingAll}
            className="self-start rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
          >
            {isLoadingAll ? "Loading..." : showAll ? "Show less" : "View all"}
          </button>
        ) : null}
      </div>

      {loadAllError ? (
        <div className="mb-4 rounded-lg border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {loadAllError}
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <TimelineSkeleton
            messages={[
              "Loading behavioral telemetry...",
              "Preparing cognitive analysis...",
              "Building forensic timeline...",
            ]}
          />
          <CardSkeleton count={2} className="grid-cols-1" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {displaySummaries.length === 0 ? (
          <div className="col-span-2 rounded-lg bg-[#111a2e] p-5 text-center text-gray-400">
            No VERIS summaries available
          </div>
        ) : (
          displaySummaries.map((item) => (
            <div
              key={item.attemptId}
              className="bg-[#111a2e] p-5 rounded-lg"
            >
              <div className="text-lg font-semibold">
                {item.candidateName}
              </div>

              <div className="text-gray-400 text-sm mb-3">
                {item.jobTitle}
              </div>

              <div className="text-sm">
                Score: <span className="text-blue-400">{item.scoreLabel ?? "-"}</span>
              </div>

              <div className="text-sm mt-1">
                Risk Level: <span className={getRiskColor(item.riskLevel)}>{item.riskLevel}</span>
              </div>

              <div className="text-sm mt-1 text-slate-300">
                Strengths: <span className="text-slate-100">{item.strengthsShort}</span>
              </div>

              <div className="text-sm mt-1 text-slate-300">
                Weaknesses: <span className="text-slate-100">{item.weaknessesShort}</span>
              </div>

              <div className="text-sm mt-1 text-slate-300">
                Behavioral Flags: <span className="text-slate-100">{item.behavioralFlagsShort}</span>
              </div>

              <div className="text-sm mt-2">
                Recommendation:
                <span className={`ml-2 ${getRecommendationColor(item.recommendation)}`}>
                  {item.recommendation}
                </span>
              </div>

              <div className="text-sm mt-1 text-slate-400">
                Reason: <span className="text-slate-200">{item.recommendationReason}</span>
              </div>
            </div>
          ))
        )}
        </div>
      )}
    </div>
  )
}




