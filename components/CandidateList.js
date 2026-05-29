"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

import { buildAuthUrl, hasAuthQuery } from "@/lib/client/auth-query"
import { TableSkeleton } from "@/components/system/skeletons"
import { CandidateActionModal } from "@/components/dashboard/CandidateActionModal"
import { DecisionPill } from "@/components/dashboard/DecisionPill"

import CandidateInsightModal from "./CandidateInsightModal"

function getStatusColor(status) {
  const normalized = String(status ?? "PENDING").toUpperCase()

  if (normalized === "COMPLETED") {
    return "text-green-400"
  }

  if (normalized === "IN_PROGRESS") {
    return "text-blue-400"
  }

  if (normalized === "SCREENED" || normalized === "READY") {
    return "text-cyan-300"
  }

  if (normalized === "SCREENING_FAILED") {
    return "text-red-400"
  }

  if (normalized === "EXPIRED") {
    return "text-red-300"
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

function formatStatusLabel(status) {
  return String(status ?? "PENDING")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function isDecisionReady(candidate) {
  const status = String(candidate.status ?? "").toUpperCase()
  return Boolean(candidate.endedAt || candidate.score !== null || candidate.decision || ["COMPLETED", "SUBMITTED", "EVALUATED"].includes(status))
}

export default function CandidateList({ initialCandidates, isLoading = false }) {
  const searchParams = useAuthSearchParams()
  const [candidates, setCandidates] = useState([])
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [reviewCandidate, setReviewCandidate] = useState(null)
  const [decisionOverrides, setDecisionOverrides] = useState({})
  const sourceCandidates = initialCandidates !== undefined ? initialCandidates : candidates
  const displayCandidates = sourceCandidates.map((candidate) => {
    const key = candidate.interviewId || candidate.candidateId
    return decisionOverrides[key]
      ? { ...candidate, recruiterDecisionStatus: decisionOverrides[key].status, recruiterDecisionNotes: decisionOverrides[key].notes }
      : candidate
  })
  const previewCandidates = displayCandidates.slice(0, 5)

  function handleDecisionSaved(candidate, decision) {
    const key = candidate.interviewId || candidate.candidateId
    setDecisionOverrides((current) => ({
      ...current,
      [key]: { status: decision.status, notes: decision.notes ?? candidate.recruiterDecisionNotes ?? null },
    }))
    setCandidates((current) => current.map((item) => {
      const itemKey = item.interviewId || item.candidateId
      return itemKey === key
        ? {
            ...item,
            recruiterDecisionStatus: decision.status,
            recruiterDecisionAt: decision.decidedAt,
            recruiterDecisionNotes: decision.notes ?? item.recruiterDecisionNotes ?? null,
          }
        : item
    }))
  }

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
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            Candidates
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
              Recent
            </span>
          </h2>

          <Link href={buildAuthUrl("/candidates", searchParams)} className="text-blue-400 text-sm">
            View All
          </Link>
        </div>

        <div className="overflow-hidden rounded-lg bg-[#111a2e]">
          <table className="w-full table-fixed text-[13px] sm:text-sm">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[27%]" />
              <col className="w-[13%]" />
              <col className="w-[8%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead className="text-gray-400 border-b border-gray-700">
              <tr>
                <th className="px-3 py-4 text-left">Candidate</th>
                <th className="px-3 py-4 text-left">Job</th>
                <th className="px-3 py-4 text-left">Status</th>
                <th className="px-3 py-4 text-left">Score</th>
                <th className="px-3 py-4 text-left">VERIS Score</th>
                <th className="px-3 py-4 text-left">Insight</th>
                <th className="px-3 py-4 text-left">Action</th>
              </tr>
            </thead>

            {isLoading ? (
              <TableSkeleton rows={5} columns={7} showAvatar />
            ) : (
              <tbody>
                {displayCandidates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-gray-400 text-center">
                    No candidates available
                  </td>
                </tr>
              ) : (
                previewCandidates.map((candidate, index) => (
                  <tr key={`${candidate.candidateName}-${index}`} className="border-b border-gray-800">
                    <td className="px-3 py-4 font-medium text-white"><span className="block truncate">{candidate.candidateName}</span></td>
                    <td className="px-3 py-4 text-gray-300"><span className="block truncate">{candidate.jobTitle}</span></td>
                    <td className={`px-3 py-4 ${getStatusColor(candidate.status)}`}><span className="block truncate">{formatStatusLabel(candidate.status)}</span></td>
                    <td className={`px-3 py-4 ${getScoreColor(candidate.score)}`}>{formatScore(candidate.score)}</td>
                    <td className={`px-3 py-4 ${getScoreColor(candidate.verisScreeningScore)}`}>{formatScore(candidate.verisScreeningScore)}</td>
                    <td className="px-3 py-4">
                      {candidate.aiSummaryFull ? (
                        <button
                          type="button"
                          className="block max-w-full truncate text-left text-blue-400"
                          onClick={() => setSelectedCandidate(candidate)}
                          title={candidate.aiSummaryShort}
                        >
                          {candidate.aiSummaryShort}
                        </button>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-4 align-middle">
                      {candidate.interviewId && isDecisionReady(candidate) ? (
                        candidate.recruiterDecisionStatus ? (
                          <DecisionPill status={candidate.recruiterDecisionStatus} />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setReviewCandidate(candidate)}
                            className="inline-flex h-9 max-w-full items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 px-3 text-xs font-semibold text-cyan-100 transition hover:border-cyan-200/45 hover:bg-cyan-400/15 hover:text-white"
                            aria-label={`Take hiring action for ${candidate.candidateName}`}
                          >
                            Take Action
                          </button>
                        )
                      ) : (
                        <span className="text-slate-500">After completion</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
              </tbody>
            )}
          </table>
        </div>
      </div>

      <CandidateInsightModal
        isOpen={Boolean(selectedCandidate)}
        onClose={() => setSelectedCandidate(null)}
        candidateName={selectedCandidate?.candidateName}
        summary={selectedCandidate?.aiSummaryFull}
      />
      <CandidateActionModal
        isOpen={Boolean(reviewCandidate)}
        candidate={reviewCandidate}
        searchParams={searchParams}
        onClose={() => setReviewCandidate(null)}
        onDecisionSaved={(decision) => {
          if (reviewCandidate) {
            handleDecisionSaved(reviewCandidate, decision)
          }
        }}
      />
    </>
  )
}




