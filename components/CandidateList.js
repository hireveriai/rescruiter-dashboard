"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

import { buildAuthUrl, hasAuthQuery } from "@/lib/client/auth-query"

import CandidateInsightModal from "./CandidateInsightModal"

function getStatusColor(status) {
  const normalized = String(status ?? "PENDING").toUpperCase()

  if (normalized === "COMPLETED") {
    return "text-green-400"
  }

  if (normalized === "IN_PROGRESS") {
    return "text-blue-400"
  }

  return "text-yellow-400"
}

function getScoreColor(score) {
  if (score === null || score === undefined) {
    return "text-gray-300"
  }

  if (score > 80) {
    return "text-green-400"
  }

  if (score >= 60) {
    return "text-yellow-400"
  }

  return "text-red-400"
}

function formatScore(score) {
  if (score === null || score === undefined) {
    return "-"
  }

  return `${Math.round(score)}%`
}

export default function CandidateList({ initialCandidates }) {
  const searchParams = useAuthSearchParams()
  const [candidates, setCandidates] = useState([])
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const displayCandidates = initialCandidates !== undefined ? initialCandidates : candidates

  useEffect(() => {
    if (initialCandidates !== undefined) {
      return
    }

    if (!hasAuthQuery(searchParams)) {
      return
    }

    let isMounted = true

    fetch(buildAuthUrl("/api/dashboard/candidates", searchParams), {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setCandidates(data.data ?? [])
        }
      })
      .catch((error) => {
        console.error("Failed to fetch dashboard candidates", error)
      })

    return () => {
      isMounted = false
    }
  }, [initialCandidates, searchParams])

  return (
    <>
      <div className="mt-10">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">
            Candidates
          </h2>

          <Link href={buildAuthUrl("/candidates", searchParams)} className="text-blue-400 text-sm">
            View More
          </Link>
        </div>

        <div className="bg-[#111a2e] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-gray-400 border-b border-gray-700">
              <tr>
                <th className="text-left p-4">Candidate</th>
                <th className="text-left p-4">Job</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4">Score</th>
                <th className="text-left p-4">VERIS Insight</th>
              </tr>
            </thead>

            <tbody>
              {displayCandidates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-gray-400 text-center">
                    No candidates available
                  </td>
                </tr>
              ) : (
                displayCandidates.map((candidate, index) => (
                  <tr key={`${candidate.candidateName}-${index}`} className="border-b border-gray-800">
                    <td className="p-4">{candidate.candidateName}</td>
                    <td className="p-4 text-gray-300">{candidate.jobTitle}</td>
                    <td className={`p-4 ${getStatusColor(candidate.status)}`}>{candidate.status}</td>
                    <td className={`p-4 ${getScoreColor(candidate.score)}`}>{formatScore(candidate.score)}</td>
                    <td className="p-4">
                      {candidate.aiSummaryFull ? (
                        <button
                          type="button"
                          className="text-blue-400 text-left"
                          onClick={() => setSelectedCandidate(candidate)}
                        >
                          {candidate.aiSummaryShort}
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CandidateInsightModal
        isOpen={Boolean(selectedCandidate)}
        onClose={() => setSelectedCandidate(null)}
        candidateName={selectedCandidate?.candidateName}
        summary={selectedCandidate?.aiSummaryFull}
      />
    </>
  )
}




