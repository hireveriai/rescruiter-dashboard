"use client"

import Link from "next/link"
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

function getInsightSummary(item) {
  const reason = String(item.recommendationReason ?? "").trim()
  const behavioralFlags = String(item.behavioralFlagsShort ?? "").trim()
  const strengths = String(item.strengthsShort ?? "").trim()

  if (reason) return reason
  if (behavioralFlags && !/^none$/i.test(behavioralFlags)) return behavioralFlags
  if (strengths) return strengths

  return "Review evidence and pipeline signals before final decision."
}

export default function VerisSummary({ initialSummaries, isLoading = false }) {
  const searchParams = useAuthSearchParams()
  const [summaries, setSummaries] = useState([])
  const [expandedSummaryIds, setExpandedSummaryIds] = useState(() => new Set())
  const baseSummaries = initialSummaries !== undefined ? initialSummaries : summaries
  const displaySummaries = baseSummaries.slice(0, DASHBOARD_SUMMARY_LIMIT)
  const hasMoreSummaries = baseSummaries.length > DASHBOARD_SUMMARY_LIMIT

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

  function toggleSummaryDetails(attemptId) {
    setExpandedSummaryIds((current) => {
      const next = new Set(current)

      if (next.has(attemptId)) {
        next.delete(attemptId)
      } else {
        next.add(attemptId)
      }

      return next
    })
  }

  return (
    <div className="mt-8">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            VERIS Insights
            <span className="ml-2 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 align-middle text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              Recent
            </span>
          </h2>
          {!isLoading ? (
            <p className="mt-1 text-sm text-slate-500">
              Showing {displaySummaries.length} of {baseSummaries.length} summaries
            </p>
          ) : null}
        </div>

        {hasMoreSummaries ? (
          <Link
            href={buildAuthUrl("/veris-insights", searchParams)}
            className="self-start rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60 sm:self-auto"
          >
            View all
          </Link>
        ) : null}
      </div>

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
          displaySummaries.map((item) => {
            const isExpanded = expandedSummaryIds.has(item.attemptId)

            return (
              <div
                key={item.attemptId}
                className="rounded-lg bg-[#111a2e] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-white">
                      {item.candidateName}
                    </div>

                    <div className="mt-0.5 truncate text-sm text-gray-400">
                      {item.jobTitle}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Risk Level</div>
                    <div className={`mt-1 text-sm font-semibold ${getRiskColor(item.riskLevel)}`}>{item.riskLevel}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-400">Recommendation</span>
                  <span className={`font-semibold ${getRecommendationColor(item.recommendation)}`}>
                    {item.recommendation}
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 min-h-[38px] text-sm leading-5 text-slate-300">
                  {getInsightSummary(item)}
                </p>

                <button
                  type="button"
                  onClick={() => toggleSummaryDetails(item.attemptId)}
                  className="mt-3 text-xs font-semibold text-cyan-200 transition hover:text-cyan-100"
                >
                  {isExpanded ? "Hide details" : "View evidence details"}
                </button>

                {isExpanded ? (
                  <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/25 p-3">
                    <div className="grid gap-2 text-sm text-slate-300">
                      <div>
                        Score: <span className="text-blue-400">{item.scoreLabel ?? "-"}</span>
                      </div>

                      <div>
                        Strengths: <span className="text-slate-100">{item.strengthsShort}</span>
                      </div>

                      <div>
                        Weaknesses: <span className="text-slate-100">{item.weaknessesShort}</span>
                      </div>

                      <div>
                        Behavioral Flags: <span className="text-slate-100">{item.behavioralFlagsShort}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
        </div>
      )}
    </div>
  )
}




