"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

import { buildAuthUrl } from "@/lib/client/auth-query"
import { copyText } from "@/lib/client/copy-to-clipboard"

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 text-cyan-300/80"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
    </svg>
  )
}

function DateTimeField({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-2 block text-sm text-gray-400">{label}</label>
      <div className="relative">
        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
          <CalendarIcon />
        </div>
        <input
          type="datetime-local"
          className="w-full rounded-2xl border border-slate-700 bg-slate-950/80 px-11 py-3 text-white outline-none transition focus:border-cyan-400/60 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.08)]"
          value={value}
          onChange={onChange}
        />
        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-200/70">
          Pick
        </div>
      </div>
    </div>
  )
}

function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return ""
  }

  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`
  }

  return `${Math.round(size / (1024 * 102.4)) / 10} MB`
}

function getFileExtension(fileName) {
  const normalized = String(fileName ?? "").trim()
  const parts = normalized.split(".")
  if (parts.length < 2) {
    return null
  }

  return parts.pop()?.toUpperCase() ?? null
}

function getResumeSourceLabel(file) {
  if (!file) {
    return "Uploaded from device"
  }

  const extension = getFileExtension(file.name)
  const typeLabel = extension || (file.type ? file.type.split("/").pop()?.toUpperCase() : null) || "FILE"
  const sizeLabel = file.size ? formatFileSize(file.size) : null

  return ["Uploaded from device", typeLabel, sizeLabel].filter(Boolean).join(" · ")
}

export default function SendInterviewModal({ isOpen, onClose }) {
  const searchParams = useAuthSearchParams()
  const primaryFileInputRef = useRef(null)
  const changeFileInputRef = useRef(null)
  const [jobs, setJobs] = useState([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobId, setJobId] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [resumeFile, setResumeFile] = useState(null)
  const [accessType, setAccessType] = useState("FLEXIBLE")
  const [startTime, setStartTime] = useState("")
  const [endTime, setEndTime] = useState("")
  const [loading, setLoading] = useState(false)
  const [link, setLink] = useState("")
  const [error, setError] = useState("")
  const [emailStatus, setEmailStatus] = useState(null)
  const [emailError, setEmailError] = useState("")
  const [copyStatus, setCopyStatus] = useState("idle")

  const resetModalState = () => {
    setJobId("")
    setName("")
    setEmail("")
    setResumeFile(null)
    setAccessType("FLEXIBLE")
    setStartTime("")
    setEndTime("")
    setLoading(false)
    setLink("")
    setError("")
    setEmailStatus(null)
    setEmailError("")
    setCopyStatus("idle")
    resetFileInputs()
  }

  useEffect(() => {
    if (!isOpen) {
      resetModalState()
      return
    }

    setJobsLoading(true)
    fetch(buildAuthUrl("/api/jobs", searchParams), {
      credentials: "include",
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        const nextJobs = data.jobs || data.data?.jobs || []
        setJobs(nextJobs)
        if (nextJobs.length === 0) {
          setJobId("")
        }
      })
      .catch((fetchError) => {
        console.error(fetchError)
        setJobs([])
      })
      .finally(() => setJobsLoading(false))
  }, [isOpen, searchParams])

  useEffect(() => {
    if (copyStatus !== "success") {
      return
    }

    const timer = setTimeout(() => setCopyStatus("idle"), 1800)
    return () => clearTimeout(timer)
  }, [copyStatus])

  const hasJobs = jobs.length > 0
  const emptyJobsState = useMemo(() => !jobsLoading && !hasJobs, [jobsLoading, hasJobs])

  const resetFileInputs = () => {
    if (primaryFileInputRef.current) {
      primaryFileInputRef.current.value = ""
    }

    if (changeFileInputRef.current) {
      changeFileInputRef.current.value = ""
    }
  }

  const handleResumeSelect = (event) => {
    const nextFile = event.target.files?.[0] || null
    setResumeFile(nextFile)

    if (!nextFile && event.target) {
      event.target.value = ""
    }
  }

  const handleSubmit = async () => {
    setError("")
    setLink("")
    setEmailStatus(null)
    setEmailError("")
    setCopyStatus("idle")

    if (!hasJobs) {
      setError("Create a job first to send your interview link")
      return
    }

    if (!jobId || !name || !email) {
      setError("Please fill all required fields")
      return
    }

    if (!resumeFile) {
      setError("Resume is required")
      return
    }

    if (accessType === "SCHEDULED" && (!startTime || !endTime)) {
      setError("Start time and end time are required")
      return
    }

    try {
      setLoading(true)

      const candidateFormData = new FormData()
      candidateFormData.append("fullName", name)
      candidateFormData.append("email", email)
      candidateFormData.append("jobId", jobId)
      candidateFormData.append("resume", resumeFile)

      const candidateResponse = await fetch(buildAuthUrl("/api/candidate", searchParams), {
        method: "POST",
        credentials: "include",
        body: candidateFormData,
      })

      const candidateText = await candidateResponse.text()
      const candidateData = candidateText ? JSON.parse(candidateText) : {}

      if (!candidateResponse.ok) {
        throw new Error(candidateData.message || candidateData.error?.message || "Failed to create candidate")
      }

      const candidateId =
        candidateData.candidateId ||
        candidateData.candidate_id ||
        candidateData.data?.candidateId ||
        candidateData.data?.candidate_id

      if (!candidateId) {
        throw new Error("Candidate ID was not returned by the API")
      }

      const interviewResponse = await fetch(buildAuthUrl("/api/interview/create-link", searchParams), {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId,
          candidateId,
          accessType,
          startTime: accessType === "SCHEDULED" ? startTime : undefined,
          endTime: accessType === "SCHEDULED" ? endTime : undefined,
        }),
      })

      const interviewText = await interviewResponse.text()
      const interviewData = interviewText ? JSON.parse(interviewText) : {}
      if (!interviewResponse.ok) {
        throw new Error(interviewData.message || interviewData.error?.message || "Failed to generate link")
      }

      const responseData = interviewData.data || interviewData
      setLink(responseData.link || "")
      setEmailStatus(responseData.emailSent === true ? "sent" : "failed")
      setEmailError(responseData.emailError || "")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send interview link")
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    const copied = await copyText(link)
    setCopyStatus(copied ? "success" : "failed")
  }

  const clearResumeFile = () => {
    setResumeFile(null)
    resetFileInputs()
  }

  const handleClose = () => {
    resetModalState()
    onClose?.()
  }

  const openCreateJobFlow = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("hireveri:open-create-job"))
    }

    handleClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-md">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-cyan-500/20 bg-[#06101f]/95 text-white shadow-[0_0_60px_rgba(37,99,235,0.18)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.14),transparent_30%)]" />
        <div className="relative max-h-[88vh] overflow-y-auto p-5 sm:p-6 md:p-8">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/80">Interview Access</p>
              <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Send Interview Link</h2>
              <p className="mt-2 max-w-lg text-sm text-slate-300">
                Secure candidate access with one-time validation, optional resume intake,
                and time-window controls.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="rounded-full border border-slate-700/80 bg-slate-900/80 px-3 py-1 text-sm text-slate-300 transition hover:border-cyan-400/60 hover:text-white"
            >
              Close
            </button>
          </div>

          {emptyJobsState ? (
            <div className="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
              <p className="text-xs font-medium uppercase tracking-[0.28em] text-amber-200/80">Job Required</p>
              <h3 className="mt-3 text-xl font-semibold text-white">Create a job first to send your interview link</h3>
              <p className="mt-3 text-sm text-amber-100/85">
                Interview links can only be generated against an existing job in your recruiter workspace.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={openCreateJobFlow}
                  className="rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
                >
                  Create Job First
                </button>
                <Link
                  href={buildAuthUrl("/jobs", searchParams)}
                  className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
                  onClick={handleClose}
                >
                  Go to Jobs Page
                </Link>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-2xl border border-slate-700 bg-slate-900/70 px-4 py-2.5 text-sm text-slate-200 transition hover:border-slate-500 hover:text-white"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="text-sm text-gray-400">Select Job *</label>
              <select
                className="mb-4 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition focus:border-cyan-400/60 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.08)]"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                disabled={jobsLoading}
              >
                <option value="">{jobsLoading ? "Loading jobs..." : "Select Job"}</option>
                {jobs.map((job) => {
                  const optionId = job.jobId || job.job_id
                  const optionTitle = job.jobTitle || job.job_title

                  return (
                    <option key={optionId} value={optionId}>
                      {optionTitle}
                    </option>
                  )
                })}
              </select>

              <label className="text-sm text-gray-400">Candidate Full Name *</label>
              <input
                className="mb-4 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.08)]"
                placeholder="Enter candidate name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />

              <label className="text-sm text-gray-400">Candidate Email *</label>
              <input
                className="mb-4 w-full rounded-2xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.08)]"
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <label className="text-sm text-gray-400">Resume *</label>
              <div className="mb-4 rounded-2xl border border-dashed border-slate-600 bg-slate-900/70 p-4">
                <input
                  ref={primaryFileInputRef}
                  type="file"
                  className="w-full text-sm text-slate-300 file:mr-4 file:rounded-full file:border-0 file:bg-cyan-500/15 file:px-4 file:py-2 file:text-sm file:font-medium file:text-cyan-200 hover:file:bg-cyan-500/25"
                  onChange={handleResumeSelect}
                />

                {resumeFile ? (
                  <div className="mt-4 rounded-2xl border border-cyan-500/15 bg-slate-950/60 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{resumeFile.name}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {getResumeSourceLabel(resumeFile)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <label className="cursor-pointer rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-cyan-400/50 hover:text-white">
                          Change
                          <input
                            ref={changeFileInputRef}
                            type="file"
                            className="hidden"
                            onChange={handleResumeSelect}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={clearResumeFile}
                          className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-200 transition hover:border-rose-300/50 hover:bg-rose-500/15 hover:text-white"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/55 p-4">
                <p className="mb-3 text-sm font-medium text-slate-300">Interview Access Type</p>

                <label className="mb-2 flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-500/20 hover:bg-slate-800/60">
                  <input
                    type="radio"
                    value="FLEXIBLE"
                    checked={accessType === "FLEXIBLE"}
                    onChange={() => setAccessType("FLEXIBLE")}
                    className="h-4 w-4 accent-cyan-400"
                  />
                  <span>Flexible (24h access)</span>
                </label>

                <label className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-500/20 hover:bg-slate-800/60">
                  <input
                    type="radio"
                    value="SCHEDULED"
                    checked={accessType === "SCHEDULED"}
                    onChange={() => setAccessType("SCHEDULED")}
                    className="h-4 w-4 accent-cyan-400"
                  />
                  <span>Scheduled (specific time window)</span>
                </label>
              </div>

              {accessType === "SCHEDULED" && (
                <div className="mb-5 rounded-2xl border border-cyan-500/15 bg-slate-900/55 p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.28em] text-cyan-200/75">
                    <CalendarIcon />
                    <span>Schedule Window</span>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <DateTimeField label="Start Time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                    <DateTimeField label="End Time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">
                - Single-use access
                <br />- Expires automatically
                <br />- Monitored for integrity
              </div>

              {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
              <button
                onClick={handleSubmit}
                disabled={loading || jobsLoading}
                className="w-full rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 px-4 py-3 text-base font-medium text-white shadow-[0_18px_30px_rgba(37,99,235,0.3)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Generating secure link..." : "Send Interview Link"}
              </button>

              {link && (
                <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <p className="mb-2 text-sm text-emerald-300">
                    {emailStatus === "sent"
                      ? "Link generated and email sent successfully"
                      : "Link generated successfully. Email delivery needs attention."}
                  </p>
                  {emailStatus === "failed" ? (
                    <p className="mb-3 text-xs text-amber-200">
                      The interview link is ready, but the email could not be delivered from the server. You can still copy and send it manually.
                      {emailError ? <><br />Reason: {emailError}</> : null}
                    </p>
                  ) : null}
                  {copyStatus === "failed" ? (
                    <p className="mb-3 text-xs text-rose-200">
                      Copy failed on this browser session. Please select the link manually.
                    </p>
                  ) : null}
                  <input
                    className="mb-3 w-full rounded-2xl border border-slate-700 bg-slate-950/80 p-3 text-sm text-white"
                    value={link}
                    readOnly
                  />
                  <button
                    onClick={copy}
                    className="w-full rounded-2xl border border-slate-600 bg-slate-900/90 px-4 py-3 text-sm text-slate-100 transition hover:border-cyan-400/50 hover:bg-slate-800"
                  >
                    {copyStatus === "success" ? "Copied" : "Copy Link"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
