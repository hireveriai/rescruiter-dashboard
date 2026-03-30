"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"

import { buildAuthUrl } from "@/lib/client/auth-query"

function getRecommendationColor(value) {
  const normalized = String(value ?? "").toUpperCase()

  if (normalized === "HIRE" || normalized === "PROCEED") {
    return "text-green-400"
  }

  if (normalized === "REVIEW") {
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

export default function VerisSummary() {
  const searchParams = useSearchParams()
  const [summaries, setSummaries] = useState([])

  useEffect(() => {
    let isMounted = true

    fetch(buildAuthUrl("/api/dashboard/veris", searchParams))
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
  }, [searchParams])

  return (
    <div className="mt-10">
      <h2 className="text-xl font-semibold mb-4">
        VERIS AI Summaries
      </h2>

      <div className="grid grid-cols-2 gap-4">
        {summaries.length === 0 ? (
          <div className="col-span-2 rounded-lg bg-[#111a2e] p-5 text-center text-gray-400">
            No VERIS summaries available
          </div>
        ) : (
          summaries.map((item) => (
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
                Overall Score: <span className="text-blue-400">{item.overallScore ?? "-"}</span>
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

              <div className="text-sm mt-2">
                Recommendation:
                <span className={`ml-2 ${getRecommendationColor(item.recommendation)}`}>
                  {item.recommendation}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
