"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"

import { buildAuthUrl } from "@/lib/client/auth-query"

import CandidateInsightModal from "../../components/CandidateInsightModal"
import Navbar from "../../components/Navbar"
import SendInterviewModal from "../../components/SendInterviewModal"

function getStatusBadge(status) {
  const normalized = String(status ?? "PENDING").toUpperCase()

  if (normalized === "COMPLETED") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
  }

  if (normalized === "IN_PROGRESS") {
    return "border-blue-500/20 bg-blue-500/10 text-blue-300"
  }

  return "border-amber-500/20 bg-amber-500/10 text-amber-300"
}

function getScoreColor(score) {
  if (score === null || score === undefined) {
    return "text-slate-400"
  }

  if (score > 80) {
    return "text-emerald-300"
  }

  if (score >= 60) {
    return "text-amber-300"
  }

  return "text-rose-300"
}

function formatScore(score) {
  if (score === null || score === undefined) {
    return "-"
  }

  return `${Math.round(score)}%`
}

export default function CandidatesPage() {
  const searchParams = useSearchParams()
  const [candidates, setCandidates] = useState([])
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [openSendInterview, setOpenSendInterview] = useState(false)

  useEffect(() => {
    let isMounted = true

    fetch(buildAuthUrl("/api/dashboard/candidates?limit=all", searchParams))
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setCandidates(data.data ?? [])
        }
      })
      .catch((error) => {
        console.error("Failed to fetch candidates page data", error)
      })

    return () => {
      isMounted = false
    }
  }, [searchParams])

  const stats = useMemo(() => {
    const total = candidates.length
    const completed = candidates.filter((candidate) => String(candidate.status).toUpperCase() === "COMPLETED").length
    const pending = candidates.filter((candidate) => String(candidate.status).toUpperCase() === "PENDING").length

    return { total, completed, pending }
  }, [candidates])

  return (
    <>
      <div className="min-h-screen bg-[#08111f] text-white">
        <Navbar onSendInterviewClick={() => setOpenSendInterview(true)} />

        <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
          <section className="rounded-[28px] border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(8,17,31,0.98))] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
            <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">Candidate Registry</p>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">All Candidates</h1>
                <p className="mt-4 text-base leading-7 text-slate-400">
                  Unified candidate view across pending and completed interview journeys, with evaluation signals and recruiter-facing AI insight.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
                  <p className="text-sm text-slate-500">Total Candidates</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{stats.total}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
                  <p className="text-sm text-slate-500">Completed</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{stats.completed}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
                  <p className="text-sm text-slate-500">Pending</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{stats.pending}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8 overflow-hidden rounded-[28px] border border-slate-800 bg-[#0f172a] shadow-[0_16px_60px_rgba(2,6,23,0.3)]">
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-white">Candidate Pipeline View</h2>
                <p className="mt-1 text-sm text-slate-400">All candidates visible to the current recruiter organization.</p>
              </div>

              <Link href={buildAuthUrl("/", searchParams)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white">
                Back to Dashboard
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="bg-slate-950/20 text-slate-400">
                  <tr>
                    <th className="p-5 text-left font-medium">Candidate</th>
                    <th className="p-5 text-left font-medium">Job</th>
                    <th className="p-5 text-left font-medium">Status</th>
                    <th className="p-5 text-left font-medium">Score</th>
                    <th className="p-5 text-left font-medium">Decision</th>
                    <th className="p-5 text-left font-medium">AI Insight</th>
                  </tr>
                </thead>

                <tbody>
                  {candidates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-400">
                        No candidates available
                      </td>
                    </tr>
                  ) : (
                    candidates.map((candidate, index) => (
                      <tr key={`${candidate.candidateName}-${index}`} className="border-t border-slate-800/80 align-top">
                        <td className="p-5 font-medium text-white">{candidate.candidateName}</td>
                        <td className="p-5 text-slate-300">{candidate.jobTitle}</td>
                        <td className="p-5">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getStatusBadge(candidate.status)}`}>
                            {candidate.status}
                          </span>
                        </td>
                        <td className={`p-5 font-medium ${getScoreColor(candidate.score)}`}>{formatScore(candidate.score)}</td>
                        <td className="p-5 text-slate-300">{candidate.decision ?? "-"}</td>
                        <td className="p-5">
                          {candidate.aiSummaryFull ? (
                            <button
                              type="button"
                              className="max-w-[420px] text-left leading-6 text-blue-300 transition hover:text-blue-200"
                              onClick={() => setSelectedCandidate(candidate)}
                            >
                              {candidate.aiSummaryShort}
                            </button>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      <CandidateInsightModal
        isOpen={Boolean(selectedCandidate)}
        onClose={() => setSelectedCandidate(null)}
        candidateName={selectedCandidate?.candidateName}
        summary={selectedCandidate?.aiSummaryFull}
      />

      <SendInterviewModal isOpen={openSendInterview} onClose={() => setOpenSendInterview(false)} />
    </>
  )
}
