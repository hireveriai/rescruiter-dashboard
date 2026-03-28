"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import Navbar from "../../components/Navbar"
import SendInterviewModal from "../../components/SendInterviewModal"

function formatDate(dateValue) {
  const date = new Date(dateValue)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function getDifficultyTone(profile) {
  const normalized = String(profile ?? "MID").toUpperCase()

  if (normalized === "SENIOR") {
    return "bg-slate-800 text-slate-100 border-slate-700"
  }

  if (normalized === "JUNIOR") {
    return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
  }

  return "bg-blue-500/10 text-blue-300 border-blue-500/20"
}

export default function JobsPage() {
  const [jobs, setJobs] = useState([])
  const [openSendInterview, setOpenSendInterview] = useState(false)

  useEffect(() => {
    let isMounted = true

    fetch("/api/jobs")
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setJobs(data.jobs ?? [])
        }
      })
      .catch((error) => {
        console.error("Failed to fetch jobs page data", error)
      })

    return () => {
      isMounted = false
    }
  }, [])

  const stats = useMemo(() => {
    const total = jobs.length
    const totalInterviews = jobs.reduce((sum, job) => sum + (job._count?.interviews ?? 0), 0)
    const seniorRoles = jobs.filter((job) => String(job.difficultyProfile).toUpperCase() === "SENIOR").length

    return { total, totalInterviews, seniorRoles }
  }, [jobs])

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <Navbar onSendInterviewClick={() => setOpenSendInterview(true)} />

      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(8,17,31,0.98))] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">Role Portfolio</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">All Jobs</h1>
              <p className="mt-4 text-base leading-7 text-slate-400">
                Live role inventory for your hiring organization, including experience band, evaluation depth, and current interview activity.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:min-w-[520px]">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-500">Total Jobs</p>
                <p className="mt-3 text-3xl font-semibold text-white">{stats.total}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-500">Active Interview Tracks</p>
                <p className="mt-3 text-3xl font-semibold text-white">{stats.totalInterviews}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-500">Senior Roles</p>
                <p className="mt-3 text-3xl font-semibold text-white">{stats.seniorRoles}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-[28px] border border-slate-800 bg-[#0f172a] shadow-[0_16px_60px_rgba(2,6,23,0.3)]">
          <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Created Job Roles</h2>
              <p className="mt-1 text-sm text-slate-400">All jobs created under the current recruiter organization.</p>
            </div>

            <Link href="/" className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white">
              Back to Dashboard
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-slate-950/20 text-slate-400">
                <tr>
                  <th className="p-5 text-left font-medium">Job Title</th>
                  <th className="p-5 text-left font-medium">Description</th>
                  <th className="p-5 text-left font-medium">Difficulty</th>
                  <th className="p-5 text-left font-medium">Experience Level</th>
                  <th className="p-5 text-left font-medium">Core Skills</th>
                  <th className="p-5 text-left font-medium">Open Interviews</th>
                  <th className="p-5 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-slate-400">No jobs available</td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.jobId} className="border-t border-slate-800/80 align-top text-slate-200">
                      <td className="p-5 font-medium text-white">{job.jobTitle}</td>
                      <td className="p-5 text-slate-400">
                        <div className="max-w-[320px] leading-6">
                          {job.jobDescription || "No job description provided"}
                        </div>
                      </td>
                      <td className="p-5">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getDifficultyTone(job.difficultyProfile)}`}>
                          {job.difficultyProfile ?? "MID"}
                        </span>
                      </td>
                      <td className="p-5 text-slate-300">{job.experienceLevelId ?? "-"}</td>
                      <td className="p-5 text-slate-300">
                        <div className="flex max-w-[260px] flex-wrap gap-2">
                          {(job.coreSkills ?? []).length > 0 ? (
                            job.coreSkills.map((skill) => (
                              <span key={skill} className="rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs text-slate-300">
                                {skill}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500">-</span>
                          )}
                        </div>
                      </td>
                      <td className="p-5 text-slate-300">{job._count?.interviews ?? 0}</td>
                      <td className="p-5 text-slate-400">{formatDate(job.createdAt)}</td>
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
