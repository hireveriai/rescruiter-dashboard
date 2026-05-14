"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

import { buildAuthUrl } from "@/lib/client/auth-query"
import { formatDateTime } from "@/lib/client/date-format"

import Navbar from "../../components/Navbar"
import SendInterviewModal from "../../components/SendInterviewModal"
import { MetricSkeleton, TableSkeleton } from "../../components/system/skeletons"

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

function normalizeSearch(value) {
  return String(value ?? "").trim().toLowerCase()
}

function uniqueSorted(values) {
  return Array.from(new Set(values.filter((value) => value !== null && value !== undefined && String(value).trim() !== "")))
    .map(String)
    .sort((a, b) => a.localeCompare(b))
}

function getScoreBand(score) {
  const numeric = Number(score)

  if (!Number.isFinite(numeric)) {
    return "UNSCORED"
  }

  if (numeric >= 80) {
    return "HIGH"
  }

  if (numeric >= 60) {
    return "MEDIUM"
  }

  return "LOW"
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 min-w-0 rounded-xl border border-slate-700 bg-slate-950/70 px-3 text-sm font-medium normal-case tracking-normal text-slate-200 outline-none transition focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function formatAnswerScore(score) {
  if (score === null || score === undefined) {
    return "-"
  }

  const numeric = Number(score)
  if (!Number.isFinite(numeric)) {
    return "-"
  }

  if (numeric >= 0 && numeric <= 1) {
    return `${Math.round(numeric * 100)}%`
  }

  if (numeric > 1 && numeric <= 5) {
    return `${numeric.toFixed(1).replace(/\.0$/, "")}/5`
  }

  return `${Math.round(numeric)}%`
}

function formatEvaluationText(evaluation) {
  if (!evaluation) {
    return null
  }

  if (typeof evaluation === "string") {
    return evaluation
  }

  if (typeof evaluation !== "object") {
    return null
  }

  const preferredKeys = ["feedback", "summary", "result", "analysis", "rationale", "reason", "strengths", "weaknesses"]
  const lines = preferredKeys.flatMap((key) => {
    const value = evaluation[key]
    if (value === null || value === undefined) {
      return []
    }

    if (Array.isArray(value)) {
      return [`${key}: ${value.join(", ")}`]
    }

    if (typeof value === "object") {
      return [`${key}: ${JSON.stringify(value)}`]
    }

    return [`${key}: ${value}`]
  })

  return lines.length > 0 ? lines.join("\n") : JSON.stringify(evaluation, null, 2)
}

function isCompletedCandidate(candidate) {
  return String(candidate?.status ?? "").toUpperCase() === "COMPLETED"
}

function CompletedCandidateModal({ candidate, onClose }) {
  if (!candidate) {
    return null
  }

  const answerSummaries = Array.isArray(candidate.answerSummaries) ? candidate.answerSummaries : []

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#020817]/80 px-4 py-4 backdrop-blur-md sm:py-6" role="dialog" aria-modal="true">
      <div className="relative w-full max-w-6xl overflow-hidden rounded-[28px] border border-emerald-400/20 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.13),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(9,14,28,0.98))] shadow-[0_0_80px_rgba(16,185,129,0.12)]">
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" />

        <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <h3 className="text-2xl font-semibold text-white">Completed Interview Summary</h3>
            <p className="mt-2 text-sm text-slate-400">
              {candidate.candidateName || "Candidate"} · {candidate.jobTitle || "Role"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="self-start rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100 transition hover:bg-emerald-400/20 sm:self-auto"
          >
            Close
          </button>
        </div>

        <div className="max-h-[74vh] overflow-auto px-6 py-6 sm:px-8">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Score</p>
              <p className="mt-3 text-2xl font-semibold text-white">{formatScore(candidate.score)}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Decision</p>
              <p className="mt-3 text-2xl font-semibold text-white">{candidate.decision || "-"}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Completed</p>
              <p className="mt-3 text-lg font-semibold text-white">{formatDateTime(candidate.endedAt || candidate.createdAt)}</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/35 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Summary</p>
            <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-300">
              {candidate.aiSummaryFull || "No AI summary has been recorded for this completed interview yet. Review the transcript below for recorded answers and evaluation details."}
            </div>
          </div>

          <div className="mt-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Transcript + Result</p>
                <h4 className="mt-2 text-lg font-semibold text-white">Question, Answer and AI Evaluation</h4>
              </div>
              <p className="text-sm text-slate-500">{answerSummaries.length} recorded answer{answerSummaries.length === 1 ? "" : "s"}</p>
            </div>

            {answerSummaries.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/35 p-5 text-sm leading-7 text-slate-400">
                No answer transcript has been recorded for this completed interview yet.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {answerSummaries.map((answer, index) => {
                  const evaluationText = formatEvaluationText(answer.evaluation)
                  const metrics = [
                    ["Score", answer.score],
                    ["Skill", answer.skillScore],
                    ["Clarity", answer.clarityScore],
                    ["Depth", answer.depthScore],
                    ["Confidence", answer.confidenceScore],
                    ["Fraud", answer.fraudScore],
                  ].filter(([, value]) => value !== null && value !== undefined)
                  const duration = answer.answerPayload?.duration

                  return (
                    <article key={answer.answerId || `${answer.question}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/35 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300/80">
                            Question {answer.questionOrder ?? index + 1}
                          </p>
                          <p className="mt-2 text-base font-medium leading-7 text-white">{answer.question}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                            {answer.skill ? <span>{answer.skill}</span> : null}
                            {answer.questionType ? <span>{answer.questionType}</span> : null}
                            {answer.questionSource ? <span>{answer.questionSource}</span> : null}
                          </div>
                        </div>
                        <div className="shrink-0 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm font-semibold text-white">
                          {formatAnswerScore(answer.score)}
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border border-slate-800/80 bg-[#08111f]/70 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Candidate Transcript</p>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-300">{answer.answerText || "No response provided."}</p>
                        {duration !== null && duration !== undefined ? (
                          <p className="mt-3 text-xs text-slate-500">Duration: {duration}s</p>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
                        <div className="rounded-xl border border-slate-800/80 bg-[#08111f]/70 p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Result</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {metrics.length === 0 ? (
                              <span className="text-sm text-slate-500">No answer-level score recorded.</span>
                            ) : (
                              metrics.map(([label, value]) => (
                                <span key={label} className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
                                  {label}: {formatAnswerScore(value)}
                                </span>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-800/80 bg-[#08111f]/70 p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">AI Feedback</p>
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                            {answer.feedback || evaluationText || "No AI feedback has been recorded for this answer."}
                          </p>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CandidatesPage() {
  const searchParams = useAuthSearchParams()
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [openSendInterview, setOpenSendInterview] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [jobFilter, setJobFilter] = useState("ALL")
  const [decisionFilter, setDecisionFilter] = useState("ALL")
  const [scoreFilter, setScoreFilter] = useState("ALL")

  useEffect(() => {
    let isMounted = true

    setLoading(true)

    setLoadError("")

    fetch(buildAuthUrl("/api/dashboard/candidates?limit=all", searchParams), {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          const rows = Array.isArray(data.data) ? data.data : data.data?.candidates
          setCandidates(Array.isArray(rows) ? rows : [])
          return
        }

        if (isMounted) {
          setCandidates([])
          setLoadError(data?.error?.message || data?.message || "Candidate data could not be loaded.")
        }
      })
      .catch((error) => {
        console.error("Failed to fetch candidates page data", error)
        if (isMounted) {
          setCandidates([])
          setLoadError("Candidate data could not be loaded.")
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
        }
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

  const filterOptions = useMemo(() => {
    return {
      statuses: uniqueSorted(candidates.map((candidate) => candidate.status)),
      jobs: uniqueSorted(candidates.map((candidate) => candidate.jobTitle)),
      decisions: uniqueSorted(candidates.map((candidate) => candidate.decision)),
    }
  }, [candidates])

  const filteredCandidates = useMemo(() => {
    const query = normalizeSearch(searchTerm)

    return candidates.filter((candidate) => {
      const status = String(candidate.status ?? "").toUpperCase()
      const jobTitle = String(candidate.jobTitle ?? "")
      const decision = String(candidate.decision ?? "")
      const scoreBand = getScoreBand(candidate.score)
      const searchable = [
        candidate.candidateName,
        candidate.jobTitle,
        candidate.status,
        candidate.decision,
        candidate.aiSummaryShort,
        candidate.aiSummaryFull,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ")

      const matchesSearch = !query || searchable.includes(query)
      const matchesStatus = statusFilter === "ALL" || status === statusFilter
      const matchesJob = jobFilter === "ALL" || jobTitle === jobFilter
      const matchesDecision = decisionFilter === "ALL" || decision === decisionFilter
      const matchesScore = scoreFilter === "ALL" || scoreBand === scoreFilter

      return matchesSearch && matchesStatus && matchesJob && matchesDecision && matchesScore
    })
  }, [candidates, searchTerm, statusFilter, jobFilter, decisionFilter, scoreFilter])

  const hasActiveFilters =
    searchTerm || statusFilter !== "ALL" || jobFilter !== "ALL" || decisionFilter !== "ALL" || scoreFilter !== "ALL"

  function clearFilters() {
    setSearchTerm("")
    setStatusFilter("ALL")
    setJobFilter("ALL")
    setDecisionFilter("ALL")
    setScoreFilter("ALL")
  }

  return (
    <>
      <div className="hv-page-enter min-h-screen bg-[#08111f] text-white">
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

              {loading ? (
                <MetricSkeleton count={3} className="sm:grid-cols-3 xl:min-w-[520px]" />
              ) : (
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
              )}
            </div>
          </section>

          <section className="mt-8 overflow-hidden rounded-[28px] border border-slate-800 bg-[#0f172a] shadow-[0_16px_60px_rgba(2,6,23,0.3)]">
            <div className="flex flex-col gap-4 border-b border-slate-800 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white">Candidate Pipeline View</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Showing {filteredCandidates.length} of {candidates.length} candidates visible to the current recruiter organization.
                </p>
              </div>

              <Link href={buildAuthUrl("/", searchParams)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white">
                Go Back to Dashboard
              </Link>
            </div>

            <div className="grid gap-4 border-b border-slate-800 bg-slate-950/20 px-6 py-5 xl:grid-cols-[minmax(220px,1.2fr)_repeat(4,minmax(150px,0.7fr))_auto]">
              <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Search
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search candidate, job, decision"
                  className="h-11 min-w-0 rounded-xl border border-slate-700 bg-slate-950/70 px-3 text-sm font-medium normal-case tracking-normal text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/60 focus:ring-2 focus:ring-cyan-300/10"
                />
              </label>
              <FilterSelect
                label="Status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[{ value: "ALL", label: "All Statuses" }, ...filterOptions.statuses.map((value) => ({ value: value.toUpperCase(), label: value.replace(/_/g, " ") }))]}
              />
              <FilterSelect
                label="Job"
                value={jobFilter}
                onChange={setJobFilter}
                options={[{ value: "ALL", label: "All Jobs" }, ...filterOptions.jobs.map((value) => ({ value, label: value }))]}
              />
              <FilterSelect
                label="Decision"
                value={decisionFilter}
                onChange={setDecisionFilter}
                options={[{ value: "ALL", label: "All Decisions" }, ...filterOptions.decisions.map((value) => ({ value, label: value }))]}
              />
              <FilterSelect
                label="Score"
                value={scoreFilter}
                onChange={setScoreFilter}
                options={[
                  { value: "ALL", label: "All Scores" },
                  { value: "HIGH", label: "80%+" },
                  { value: "MEDIUM", label: "60-79%" },
                  { value: "LOW", label: "Below 60%" },
                  { value: "UNSCORED", label: "Unscored" },
                ]}
              />
              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="h-11 self-end rounded-xl border border-slate-700 px-4 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                Clear
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="bg-slate-950/20 text-slate-400">
                  <tr>
                    <th className="p-5 text-left font-medium">Candidate</th>
                    <th className="p-5 text-left font-medium">Job</th>
                    <th className="p-5 text-left font-medium">Status</th>
                    <th className="p-5 text-left font-medium">Score</th>
                    <th className="p-5 text-left font-medium">Decision</th>
                    <th className="p-5 text-left font-medium">AI Insight</th>
                    <th className="p-5 text-right font-medium">Action</th>
                  </tr>
                </thead>

                {loading ? (
                  <TableSkeleton rows={8} columns={7} showAvatar showStatusChip />
                ) : (
                  <tbody>
                    {loadError ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-amber-200">
                        {loadError}
                      </td>
                    </tr>
                  ) : candidates.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-400">
                        No candidates available
                      </td>
                    </tr>
                  ) : filteredCandidates.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-slate-400">
                        No candidates match the current filters
                      </td>
                    </tr>
                  ) : (
                    filteredCandidates.map((candidate, index) => (
                      <tr key={candidate.interviewId || candidate.candidateId || `${candidate.candidateName}-${index}`} className="border-t border-slate-800/80 align-top">
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
                          {candidate.aiSummaryFull && isCompletedCandidate(candidate) ? (
                            <span className="block max-w-[360px] leading-6 text-slate-300">
                              {candidate.aiSummaryShort}
                            </span>
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </td>
                        <td className="p-5 text-right">
                          {isCompletedCandidate(candidate) ? (
                            <button
                              type="button"
                              onClick={() => setSelectedCandidate(candidate)}
                              className="inline-flex items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/50 hover:bg-emerald-400/15 hover:text-white"
                              aria-label={`View completed summary for ${candidate.candidateName}`}
                            >
                              View
                            </button>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                  </tbody>
                )}
              </table>
            </div>
          </section>
        </main>
      </div>

      <CompletedCandidateModal candidate={selectedCandidate} onClose={() => setSelectedCandidate(null)} />

      <SendInterviewModal isOpen={openSendInterview} onClose={() => setOpenSendInterview(false)} />
    </>
  )
}

