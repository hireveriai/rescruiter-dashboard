"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import Navbar from "../../components/Navbar"
import SendInterviewModal from "../../components/SendInterviewModal"

function formatDateTime(dateValue) {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getStatusBadge(status) {
  const normalized = String(status ?? "PENDING").toUpperCase()
  if (normalized === "COMPLETED") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
  if (normalized === "IN_PROGRESS") return "border-blue-500/20 bg-blue-500/10 text-blue-300"
  return "border-amber-500/20 bg-amber-500/10 text-amber-300"
}

function formatScore(score) {
  return score === null || score === undefined ? "-" : `${Math.round(score)}%`
}

function getAccessLabel(item) {
  if (String(item.accessType ?? "FLEXIBLE").toUpperCase() === "SCHEDULED") {
    return item.startTime ? `Scheduled � ${formatDateTime(item.startTime)}` : "Scheduled"
  }

  return "Flexible"
}

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState([])
  const [openSendInterview, setOpenSendInterview] = useState(false)

  useEffect(() => {
    let isMounted = true

    fetch("/api/dashboard/interviews")
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setInterviews(data.data ?? [])
        }
      })
      .catch((error) => {
        console.error("Failed to fetch interviews page data", error)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const stats = useMemo(() => {
    const total = interviews.length
    const active = interviews.filter((item) => ["PENDING", "IN_PROGRESS"].includes(String(item.status).toUpperCase())).length
    const completed = interviews.filter((item) => String(item.status).toUpperCase() === "COMPLETED").length

    return { total, active, completed }
  }, [interviews])

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
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
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-[28px] border border-slate-800 bg-[#0f172a] shadow-[0_16px_60px_rgba(2,6,23,0.3)]">
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Interview Register</h2>
              <p className="mt-1 text-sm text-slate-400">All interviews under the current recruiter organization.</p>
            </div>

            <Link href="/" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white">
              Back to Dashboard
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-slate-950/20 text-slate-400">
                <tr>
                  <th className="p-5 text-left font-medium">Candidate</th>
                  <th className="p-5 text-left font-medium">Job</th>
                  <th className="p-5 text-left font-medium">Status</th>
                  <th className="p-5 text-left font-medium">Interview Type</th>
                  <th className="p-5 text-left font-medium">Score</th>
                  <th className="p-5 text-left font-medium">Decision</th>
                  <th className="p-5 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {interviews.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-slate-400">No interviews available</td>
                  </tr>
                ) : (
                  interviews.map((interview) => (
                    <tr key={interview.interviewId} className="border-t border-slate-800/80 text-slate-200">
                      <td className="p-5 font-medium text-white">{interview.candidateName}</td>
                      <td className="p-5 text-slate-300">{interview.jobTitle}</td>
                      <td className="p-5">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getStatusBadge(interview.status)}`}>
                          {interview.status}
                        </span>
                      </td>
                      <td className="p-5 text-slate-300">{getAccessLabel(interview)}</td>
                      <td className="p-5 text-slate-300">{formatScore(interview.score)}</td>
                      <td className="p-5 text-slate-300">{interview.decision ?? "-"}</td>
                      <td className="p-5 text-slate-400">{formatDateTime(interview.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <SendInterviewModal isOpen={openSendInterview} onClose={() => setOpenSendInterview(false)} />
    </div>
  )
}
