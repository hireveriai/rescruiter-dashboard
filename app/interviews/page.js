"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

import { buildAuthUrl } from "@/lib/client/auth-query"
import { copyText } from "@/lib/client/copy-to-clipboard"
import { formatDateTime } from "@/lib/client/date-format"

import Navbar from "../../components/Navbar"
import SendInterviewModal from "../../components/SendInterviewModal"
import { MetricSkeleton, TableSkeleton, TimelineSkeleton } from "../../components/system/skeletons"

function getStatusBadge(status) {
  const normalized = String(status ?? "PENDING").toUpperCase()
  if (normalized === "COMPLETED") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
  if (normalized === "READY") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
  if (normalized === "EMAIL_FAILED") return "border-amber-500/20 bg-amber-500/10 text-amber-300"
  if (normalized === "PREPARATION_FAILED") return "border-rose-500/20 bg-rose-500/10 text-rose-300"
  if (normalized === "PREPARING_INTERVIEW" || normalized === "SENDING_EMAIL") return "border-blue-500/20 bg-blue-500/10 text-blue-300"
  if (normalized === "IN_PROGRESS") return "border-blue-500/20 bg-blue-500/10 text-blue-300"
  if (normalized === "FLAGGED") return "border-rose-500/20 bg-rose-500/10 text-rose-300"
  if (["EXPIRED", "REVOKED", "USED"].includes(normalized)) return "border-slate-600 bg-slate-800/60 text-slate-300"
  return "border-amber-500/20 bg-amber-500/10 text-amber-300"
}

function formatStatusText(status) {
  const normalized = String(status ?? "PENDING").toUpperCase()
  if (normalized === "PREPARING_INTERVIEW") return "Preparing Interview"
  if (normalized === "EMAIL_FAILED") return "Email Failed"
  if (normalized === "PREPARATION_FAILED") return "Preparation Failed"
  if (normalized === "SENDING_EMAIL") return "Sending Email"
  if (normalized === "READY") return "Ready"
  return String(status ?? "PENDING").replace(/_/g, " ")
}

function formatScore(score) {
  return score === null || score === undefined ? "-" : `${Math.round(score)}%`
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

function isCompletedInterview(interview) {
  return String(interview?.status ?? "").toUpperCase() === "COMPLETED"
}

function getAccessLabel(item) {
  if (String(item.accessType ?? "FLEXIBLE").toUpperCase() === "SCHEDULED") {
    return item.startTime ? `Scheduled · ${formatDateTime(item.startTime)}` : "Scheduled"
  }

  return "Flexible"
}

function CompletedInterviewModal({ interview, onClose }) {
  if (!interview) {
    return null
  }

  const answerSummaries = Array.isArray(interview.answerSummaries) ? interview.answerSummaries : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020817]/80 px-4 backdrop-blur-md">
      <div className="relative w-full max-w-6xl overflow-hidden rounded-[28px] border border-emerald-400/20 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.13),_transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(9,14,28,0.98))] shadow-[0_0_80px_rgba(16,185,129,0.12)]">
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" />

        <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <h3 className="text-2xl font-semibold text-white">Completed Interview Summary</h3>
            <p className="mt-2 text-sm text-slate-400">
              {interview.candidateName || "Candidate"} · {interview.jobTitle || "Role"}
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
              <p className="mt-3 text-2xl font-semibold text-white">{formatScore(interview.score)}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Decision</p>
              <p className="mt-3 text-2xl font-semibold text-white">{interview.decision || "-"}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Completed</p>
              <p className="mt-3 text-lg font-semibold text-white">{formatDateTime(interview.endedAt || interview.createdAt)}</p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/35 p-5">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Summary</p>
            <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-300">
              {interview.aiSummary || "No AI summary has been recorded for this completed interview yet. Review the transcript below for recorded answers and evaluation details."}
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

export default function InterviewsPage() {
  const searchParams = useAuthSearchParams()
  const [interviews, setInterviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedInterview, setSelectedInterview] = useState(null)
  const [openSendInterview, setOpenSendInterview] = useState(false)
  const [actionBusyId, setActionBusyId] = useState("")
  const [copiedInterviewId, setCopiedInterviewId] = useState("")

  async function loadInterviews() {
    const response = await fetch(buildAuthUrl("/api/dashboard/interviews", searchParams), {
      credentials: "include",
      cache: "no-store",
    })
    const data = await response.json()
    if (data.success) {
      setInterviews(data.data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    let isMounted = true

    setLoading(true)

    fetch(buildAuthUrl("/api/dashboard/interviews", searchParams), {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setInterviews(data.data ?? [])
        }
      })
      .catch((error) => {
        console.error("Failed to fetch interviews page data", error)
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

  useEffect(() => {
    if (!selectedInterview) {
      return undefined
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setSelectedInterview(null)
      }
    }

    document.addEventListener("keydown", handleEscape)

    return () => {
      document.removeEventListener("keydown", handleEscape)
    }
  }, [selectedInterview])

  const stats = useMemo(() => {
    const total = interviews.length
    const active = interviews.filter((item) => ["PENDING", "READY", "EMAIL_FAILED", "IN_PROGRESS", "SENDING_EMAIL", "PREPARING_INTERVIEW"].includes(String(item.status).toUpperCase())).length
    const completed = interviews.filter(isCompletedInterview).length

    return { total, active, completed }
  }, [interviews])

  async function retryPreparation(interview) {
    try {
      setActionBusyId(interview.interviewId)
      const response = await fetch(buildAuthUrl(`/api/interview/${interview.interviewId}/retry-preparation`, searchParams), {
        method: "POST",
        credentials: "include",
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error?.message || data?.message || "Failed to retry preparation")
      }
      await loadInterviews()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to retry preparation")
    } finally {
      setActionBusyId("")
    }
  }

  async function retryEmail(interview) {
    try {
      setActionBusyId(interview.interviewId)
      const response = await fetch(buildAuthUrl(`/api/interview/${interview.interviewId}/retry-email`, searchParams), {
        method: "POST",
        credentials: "include",
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data?.error?.message || data?.message || "Failed to retry email")
      }
      await loadInterviews()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to retry email")
    } finally {
      setActionBusyId("")
    }
  }

  async function copyLink(interview) {
    if (!interview.link) {
      return
    }

    const copied = await copyText(interview.link)
    if (copied) {
      setCopiedInterviewId(interview.interviewId)
      setTimeout(() => setCopiedInterviewId(""), 1600)
    }
  }

  return (
    <div className="hv-page-enter min-h-screen bg-[#08111f] text-white">
      <Navbar onSendInterviewClick={() => setOpenSendInterview(true)} />

      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(8,17,31,0.98))] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">Interview Registry</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">All Interviews</h1>
              <p className="mt-4 text-base leading-7 text-slate-400">
                Current interview operations across flexible and scheduled access windows, with score and decision visibility where evaluation is complete.
              </p>
            </div>

            {loading ? (
              <MetricSkeleton count={3} className="sm:grid-cols-3 xl:min-w-[520px]" />
            ) : (
            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-500">Total Interviews</p>
                <p className="mt-3 text-3xl font-semibold text-white">{stats.total}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-500">Active Queue</p>
                <p className="mt-3 text-3xl font-semibold text-white">{stats.active}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-500">Completed</p>
                <p className="mt-3 text-3xl font-semibold text-white">{stats.completed}</p>
              </div>
            </div>
            )}
          </div>
        </section>

        {loading ? (
          <div className="mt-6">
            <TimelineSkeleton count={3} messages={["Preparing interview queue...", "Loading scorecard signals...", "Checking forensic recovery status..."]} />
          </div>
        ) : null}

        <section className="mt-8 overflow-hidden rounded-[28px] border border-slate-800 bg-[#0f172a] shadow-[0_16px_60px_rgba(2,6,23,0.3)]">
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Interview Register</h2>
              <p className="mt-1 text-sm text-slate-400">All interviews under the current recruiter organization.</p>
            </div>

            <Link href={buildAuthUrl("/", searchParams)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white">
              Back to Dashboard
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1220px] text-sm">
              <thead className="bg-slate-950/20 text-slate-400">
                <tr>
                  <th className="p-5 text-left font-medium">Candidate</th>
                  <th className="p-5 text-left font-medium">Job</th>
                  <th className="p-5 text-left font-medium">Status</th>
                  <th className="p-5 text-left font-medium">Interview Type</th>
                  <th className="p-5 text-left font-medium">Score</th>
                  <th className="p-5 text-left font-medium">Decision</th>
                  <th className="p-5 text-left font-medium">Created</th>
                  <th className="p-5 text-right font-medium">Action</th>
                </tr>
              </thead>
              {loading ? (
                <TableSkeleton rows={8} columns={8} showAvatar showStatusChip />
              ) : (
                <tbody>
                  {interviews.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-10 text-center text-slate-400">No interviews available</td>
                  </tr>
                ) : (
                  interviews.map((interview) => (
                    <tr key={interview.interviewId} className="border-t border-slate-800/80 text-slate-200">
                      <td className="p-5 font-medium text-white">{interview.candidateName}</td>
                      <td className="p-5 text-slate-300">{interview.jobTitle}</td>
                      <td className="p-5">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getStatusBadge(interview.status)}`}>
                          {formatStatusText(interview.status)}
                        </span>
                      </td>
                      <td className="p-5 text-slate-300">{getAccessLabel(interview)}</td>
                      <td className="p-5 text-slate-300">{formatScore(interview.score)}</td>
                      <td className="p-5 text-slate-300">{interview.decision ?? "-"}</td>
                      <td className="p-5 text-slate-400">{formatDateTime(interview.createdAt)}</td>
                      <td className="p-5 text-right">
                        {isCompletedInterview(interview) ? (
                          <button
                            type="button"
                            onClick={() => setSelectedInterview(interview)}
                            className="inline-flex items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/50 hover:bg-emerald-400/15 hover:text-white"
                            aria-label={`View completed summary for ${interview.candidateName}`}
                          >
                            View
                          </button>
                        ) : String(interview.status).toUpperCase() === "PREPARATION_FAILED" ? (
                          <button
                            type="button"
                            onClick={() => retryPreparation(interview)}
                            disabled={actionBusyId === interview.interviewId}
                            className="inline-flex items-center justify-center rounded-xl border border-rose-400/25 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-300/50 hover:bg-rose-400/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {actionBusyId === interview.interviewId ? "Retrying..." : "Retry Prep"}
                          </button>
                        ) : String(interview.status).toUpperCase() === "EMAIL_FAILED" ? (
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => copyLink(interview)}
                              disabled={!interview.link}
                              className="inline-flex items-center justify-center rounded-xl border border-slate-600 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {copiedInterviewId === interview.interviewId ? "Copied" : "Copy Link"}
                            </button>
                            <button
                              type="button"
                              onClick={() => retryEmail(interview)}
                              disabled={actionBusyId === interview.interviewId}
                              className="inline-flex items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-100 transition hover:border-amber-300/50 hover:bg-amber-400/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {actionBusyId === interview.interviewId ? "Sending..." : "Retry Email"}
                            </button>
                          </div>
                        ) : String(interview.status).toUpperCase() === "READY" ? (
                          <button
                            type="button"
                            onClick={() => copyLink(interview)}
                            disabled={!interview.link}
                            className="inline-flex items-center justify-center rounded-xl border border-slate-600 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {copiedInterviewId === interview.interviewId ? "Copied" : "Copy Link"}
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

      <SendInterviewModal isOpen={openSendInterview} onClose={() => setOpenSendInterview(false)} />
      <CompletedInterviewModal interview={selectedInterview} onClose={() => setSelectedInterview(null)} />
    </div>
  )
}

