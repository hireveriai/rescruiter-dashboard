"use client"

import Link from "next/link"
import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react"

import Navbar from "@/components/Navbar"
import SendInterviewModal from "@/components/SendInterviewModal"
import { buildAuthUrl } from "@/lib/client/auth-query"
import { useAuthSearchParams } from "@/lib/client/use-auth-search-params"

type ExistingJob = {
  jobId: string
  jobTitle: string
  jobDescription: string | null
  coreSkills?: string[]
  isActive?: boolean
}

type ScreeningJob = {
  id: string
  title: string
  description: string
  requiredSkills: string[]
  experienceNeeded: number | null
  roleTitle: string | null
  createdAt: string
}

type MatchRow = {
  id: string
  candidateId: string
  candidateName: string
  email: string | null
  phone: string | null
  resumeUrl: string | null
  matchScore: number
  skillMatch: number
  experienceMatch: number
  riskLevel: "LOW" | "MEDIUM" | "HIGH"
  recommendation: "STRONG_FIT" | "POTENTIAL" | "WEAK" | "REJECT"
  insights: {
    missing_skills?: string[]
    short_reasoning?: string
  }
  createdAt: string
}

type UploadRow = {
  fileName: string
  status: "uploaded" | "failed"
  candidateId: string | null
  name: string | null
  email: string | null
  error: string | null
}

type SendResult = {
  candidateId: string
  candidateName: string
  email: string | null
  status: "SENT" | "FAILED" | "SKIPPED"
  error: string | null
  inviteLink: string | null
}

const recommendationFilters = ["ALL", "STRONG_FIT", "POTENTIAL", "WEAK", "REJECT"] as const
const riskFilters = ["ALL", "LOW", "MEDIUM", "HIGH"] as const

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M20 16.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.5" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4 20-7Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  )
}

function getRiskTone(risk: MatchRow["riskLevel"]) {
  if (risk === "LOW") {
    return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
  }

  if (risk === "MEDIUM") {
    return "border-amber-500/20 bg-amber-500/10 text-amber-300"
  }

  return "border-rose-500/20 bg-rose-500/10 text-rose-300"
}

function getRecommendationTone(recommendation: MatchRow["recommendation"]) {
  if (recommendation === "STRONG_FIT") {
    return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
  }

  if (recommendation === "POTENTIAL") {
    return "border-blue-400/30 bg-blue-500/10 text-blue-200"
  }

  if (recommendation === "WEAK") {
    return "border-amber-400/25 bg-amber-500/10 text-amber-200"
  }

  return "border-slate-600 bg-slate-900/80 text-slate-300"
}

function getScoreColor(score: number) {
  if (score >= 82) {
    return "text-emerald-300"
  }

  if (score >= 62) {
    return "text-cyan-200"
  }

  if (score >= 42) {
    return "text-amber-300"
  }

  return "text-rose-300"
}

async function readJsonResponse(response: Response) {
  const payload = await response.json().catch(() => null)

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error?.message || payload?.message || "Request failed")
  }

  return payload
}

function authUrl(path: string) {
  return buildAuthUrl(path)
}

export default function AiScreeningPage() {
  const searchParams = useAuthSearchParams()
  const [openSendInterview, setOpenSendInterview] = useState(false)
  const [existingJobs, setExistingJobs] = useState<ExistingJob[]>([])
  const [screeningJobs, setScreeningJobs] = useState<ScreeningJob[]>([])
  const [selectedExistingJobId, setSelectedExistingJobId] = useState("")
  const [activeJob, setActiveJob] = useState<ScreeningJob | null>(null)
  const [jdTitle, setJdTitle] = useState("")
  const [jdText, setJdText] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [recommendationFilter, setRecommendationFilter] = useState<(typeof recommendationFilters)[number]>("ALL")
  const [riskFilter, setRiskFilter] = useState<(typeof riskFilters)[number]>("ALL")
  const [sortMode, setSortMode] = useState<"score" | "recent">("score")
  const [topN, setTopN] = useState(10)
  const [dragActive, setDragActive] = useState(false)
  const [jobLoading, setJobLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [matching, setMatching] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [editingCandidateId, setEditingCandidateId] = useState("")
  const [emailDraft, setEmailDraft] = useState("")
  const [sendResults, setSendResults] = useState<SendResult[]>([])

  useEffect(() => {
    let active = true

    async function loadInitialData() {
      try {
        const [jobsResponse, screeningJobsResponse] = await Promise.all([
          fetch(authUrl("/api/jobs?includeInactive=1"), {
            credentials: "include",
            cache: "no-store",
          }),
          fetch(authUrl("/api/process-jd"), {
            credentials: "include",
            cache: "no-store",
          }),
        ])
        const jobsPayload = await jobsResponse.json()
        const screeningPayload = await screeningJobsResponse.json()

        if (!active) {
          return
        }

        if (jobsPayload.success) {
          setExistingJobs(jobsPayload.jobs ?? [])
        }

        if (screeningPayload.success) {
          const jobs = screeningPayload.data ?? []
          setScreeningJobs(jobs)
          if (jobs.length > 0) {
            setActiveJob(jobs[0])
          }
        }
      } catch (loadError) {
        console.error("Failed to load AI screening data", loadError)
      }
    }

    loadInitialData()

    return () => {
      active = false
    }
  }, [searchParams])

  useEffect(() => {
    const activeJobId = activeJob?.id

    if (!activeJobId) {
      return
    }

    let active = true

    async function loadMatches() {
      try {
        const response = await fetch(authUrl(`/api/match-candidates?job_id=${activeJobId}`), {
          credentials: "include",
          cache: "no-store",
        })
        const payload = await response.json()

        if (active && payload.success) {
          setMatches(payload.data?.matches ?? [])
        }
      } catch (loadError) {
        console.error("Failed to load match results", loadError)
      }
    }

    loadMatches()

    return () => {
      active = false
    }
  }, [activeJob?.id, searchParams])

  const filteredMatches = useMemo(() => {
    const filtered = matches.filter((match) => {
      const recommendationMatch =
        recommendationFilter === "ALL" || match.recommendation === recommendationFilter
      const riskMatch = riskFilter === "ALL" || match.riskLevel === riskFilter
      return recommendationMatch && riskMatch
    })

    return [...filtered].sort((left, right) => {
      if (sortMode === "recent") {
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      }

      return right.matchScore - left.matchScore
    })
  }, [matches, recommendationFilter, riskFilter, sortMode])

  const stats = useMemo(() => {
    const strongFit = matches.filter((match) => match.recommendation === "STRONG_FIT").length
    const noEmail = matches.filter((match) => !match.email).length
    const averageScore =
      matches.length > 0
        ? Math.round(matches.reduce((sum, match) => sum + match.matchScore, 0) / matches.length)
        : 0

    return {
      candidates: matches.length,
      strongFit,
      noEmail,
      averageScore,
    }
  }, [matches])

  const selectedExistingJob = useMemo(
    () => existingJobs.find((job) => job.jobId === selectedExistingJobId) ?? null,
    [existingJobs, selectedExistingJobId]
  )

  function setSelectedFiles(fileList: FileList | File[]) {
    const nextFiles = Array.from(fileList).filter((file) => /\.(pdf|docx)$/i.test(file.name))
    setFiles(nextFiles)
    setUploadRows([])
    setError("")
    setNotice(nextFiles.length ? `${nextFiles.length} resume${nextFiles.length === 1 ? "" : "s"} ready for upload.` : "")
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      setSelectedFiles(event.target.files)
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragActive(false)
    setSelectedFiles(event.dataTransfer.files)
  }

  async function handleUpload() {
    if (files.length === 0) {
      setError("Choose PDF or DOCX resumes before uploading.")
      return
    }

    try {
      setUploading(true)
      setError("")
      setNotice("Analyzing candidates...")
      const formData = new FormData()
      files.forEach((file) => formData.append("files", file))
      const response = await fetch(authUrl("/api/upload-resumes"), {
        method: "POST",
        credentials: "include",
        body: formData,
      })
      const payload = await readJsonResponse(response)
      const rows = payload.data?.results ?? []
      setUploadRows(rows)
      setNotice(`${payload.data?.uploadedCount ?? 0} resumes parsed and saved.`)
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Resume upload failed")
    } finally {
      setUploading(false)
    }
  }

  async function handleProcessJob() {
    try {
      setJobLoading(true)
      setError("")
      setNotice("Extracting job intelligence...")
      const response = await fetch(authUrl("/api/process-jd"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existingJobId: selectedExistingJobId || undefined,
          title: jdTitle || selectedExistingJob?.jobTitle || undefined,
          description: jdText || selectedExistingJob?.jobDescription || undefined,
        }),
      })
      const payload = await readJsonResponse(response)
      const job = payload.data as ScreeningJob
      setActiveJob(job)
      setScreeningJobs((current) => [job, ...current.filter((item) => item.id !== job.id)])
      setNotice(`Job intelligence ready for ${job.title}.`)
    } catch (processError) {
      setError(processError instanceof Error ? processError.message : "Could not process job description")
    } finally {
      setJobLoading(false)
    }
  }

  async function handleMatchCandidates() {
    if (!activeJob) {
      setError("Process a job description before matching candidates.")
      return
    }

    try {
      setMatching(true)
      setError("")
      setNotice("Analyzing candidates...")
      const response = await fetch(authUrl("/api/match-candidates"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: activeJob.id }),
      })
      const payload = await readJsonResponse(response)
      setMatches(payload.data?.matches ?? [])
      setNotice(`${payload.data?.matchedCount ?? 0} candidates ranked for ${activeJob.title}.`)
    } catch (matchError) {
      setError(matchError instanceof Error ? matchError.message : "Candidate matching failed")
    } finally {
      setMatching(false)
    }
  }

  async function handleSendInterviews(mode: "STRONG_FIT" | "TOP_N" | "SELECTED", candidateIds?: string[]) {
    if (!activeJob) {
      setError("Choose a processed job before sending interviews.")
      return
    }

    try {
      setSending(true)
      setError("")
      setNotice("Sending interview invitations...")
      const response = await fetch(authUrl("/api/send-interviews"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: activeJob.id,
          mode,
          topN,
          candidateIds,
        }),
      })
      const payload = await readJsonResponse(response)
      setSendResults(payload.data?.results ?? [])
      setNotice(`${payload.data?.sentCount ?? 0} interview invitations sent.`)
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Bulk interview send failed")
    } finally {
      setSending(false)
    }
  }

  async function handleSaveEmail(candidateId: string) {
    try {
      setError("")
      const response = await fetch(authUrl(`/api/ai-screening/candidates/${candidateId}`), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailDraft }),
      })
      const payload = await readJsonResponse(response)
      setMatches((current) =>
        current.map((match) =>
          match.candidateId === candidateId ? { ...match, email: payload.data?.email ?? null } : match
        )
      )
      setEditingCandidateId("")
      setEmailDraft("")
      setNotice("Candidate email updated.")
    } catch (emailError) {
      setError(emailError instanceof Error ? emailError.message : "Could not update candidate email")
    }
  }

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <Navbar onSendInterviewClick={() => setOpenSendInterview(true)} />

      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(8,17,31,0.98))] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">AI Screening</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">Pre-Interview Intelligence Layer</h1>
              <p className="mt-4 text-base leading-7 text-slate-400">
                Bulk resume parsing, JD intelligence, candidate ranking, email capture, and interview invitation dispatch in one recruiter workflow.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4 xl:min-w-[680px]">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-500">Matched</p>
                <p className="mt-3 text-3xl font-semibold text-white">{stats.candidates}</p>
              </div>
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                <p className="text-sm text-cyan-200/70">Strong Fit</p>
                <p className="mt-3 text-3xl font-semibold text-cyan-100">{stats.strongFit}</p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
                <p className="text-sm text-slate-500">Avg Score</p>
                <p className="mt-3 text-3xl font-semibold text-white">{stats.averageScore}%</p>
              </div>
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-200/70">No Email</p>
                <p className="mt-3 text-3xl font-semibold text-amber-100">{stats.noEmail}</p>
              </div>
            </div>
          </div>
        </section>

        {(notice || error || uploading || matching) ? (
          <section className="mt-6 rounded-2xl border border-slate-800 bg-[#0f172a] px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className={`text-sm font-medium ${error ? "text-rose-200" : "text-slate-200"}`}>
                  {error || notice || "Processing"}
                </p>
                {uploading || matching ? (
                  <p className="mt-1 text-sm text-slate-400">Analyzing candidates...</p>
                ) : null}
              </div>
              {uploading || matching || sending || jobLoading ? (
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900 md:w-72">
                  <div className="h-full w-2/3 animate-pulse rounded-full bg-cyan-300" />
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        <div className="mt-8 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="rounded-[28px] border border-slate-800 bg-[#0f172a] p-6 shadow-[0_16px_60px_rgba(2,6,23,0.3)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Resume Intake</h2>
                <p className="mt-1 text-sm text-slate-400">{files.length} selected, {uploadRows.filter((row) => row.status === "uploaded").length} saved</p>
              </div>
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || files.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UploadIcon />
                {uploading ? "Uploading..." : "Upload Resumes"}
              </button>
            </div>

            <label
              onDragEnter={(event) => {
                event.preventDefault()
                setDragActive(true)
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault()
                setDragActive(false)
              }}
              onDrop={handleDrop}
              className={[
                "mt-5 flex min-h-[210px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center transition",
                dragActive
                  ? "border-cyan-300 bg-cyan-400/10 text-cyan-100"
                  : "border-slate-700 bg-slate-950/35 text-slate-300 hover:border-slate-500 hover:bg-slate-950/45",
              ].join(" ")}
            >
              <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple className="sr-only" onChange={handleFileChange} />
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/80 text-cyan-200">
                <UploadIcon />
              </div>
              <p className="mt-4 text-base font-semibold text-white">Drop PDF/DOCX resumes</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">Files are stored in Supabase Storage, parsed, email-validated, and saved to the recruiter workspace.</p>
            </label>

            {files.length > 0 ? (
              <div className="mt-5 max-h-52 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/25">
                {files.map((file) => (
                  <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-4 border-b border-slate-800/80 px-4 py-3 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{file.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{Math.max(1, Math.round(file.size / 1024))} KB</p>
                    </div>
                    <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                      Queued
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {uploadRows.length > 0 ? (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/25">
                {uploadRows.map((row) => (
                  <div key={row.fileName} className="flex items-start justify-between gap-4 border-b border-slate-800/80 px-4 py-3 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{row.name || row.fileName}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{row.email || row.error || "No Email ⚠️"}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${row.status === "uploaded" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-rose-500/20 bg-rose-500/10 text-rose-300"}`}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-[28px] border border-slate-800 bg-[#0f172a] p-6 shadow-[0_16px_60px_rgba(2,6,23,0.3)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Job Intelligence</h2>
                <p className="mt-1 text-sm text-slate-400">{activeJob ? activeJob.title : "No active screening job"}</p>
              </div>
              <button
                type="button"
                onClick={handleProcessJob}
                disabled={jobLoading || (!selectedExistingJobId && !jdText.trim())}
                className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-100 transition hover:border-blue-300/50 hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {jobLoading ? "Processing..." : "Process JD"}
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="text-sm font-medium text-slate-300">Select Existing Job</label>
                <select
                  value={selectedExistingJobId}
                  onChange={(event) => setSelectedExistingJobId(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400/60"
                >
                  <option value="">Paste a new JD instead</option>
                  {existingJobs.map((job) => (
                    <option key={job.jobId} value={job.jobId}>{job.jobTitle}</option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 md:grid-cols-[0.55fr_1.45fr]">
                <div>
                  <label className="text-sm font-medium text-slate-300">Role Title</label>
                  <input
                    value={jdTitle}
                    onChange={(event) => setJdTitle(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/60"
                    placeholder={selectedExistingJob?.jobTitle || "Role title"}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300">Processed Job</label>
                  <select
                    value={activeJob?.id ?? ""}
                    onChange={(event) => {
                      const job = screeningJobs.find((item) => item.id === event.target.value) ?? null
                      setActiveJob(job)
                    }}
                    className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400/60"
                  >
                    <option value="">No processed job selected</option>
                    {screeningJobs.map((job) => (
                      <option key={job.id} value={job.id}>{job.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-300">Job Description</label>
                <textarea
                  value={jdText}
                  onChange={(event) => setJdText(event.target.value)}
                  rows={8}
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/60"
                  placeholder={selectedExistingJob?.jobDescription || "Paste the JD here"}
                />
              </div>
            </div>

            {activeJob ? (
              <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/25 p-4">
                <div className="flex flex-wrap gap-2">
                  {activeJob.requiredSkills.slice(0, 12).map((skill) => (
                    <span key={skill} className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-xs text-slate-200">
                      {skill}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-400">Experience needed: {activeJob.experienceNeeded ?? "Not specified"} years</p>
                  <button
                    type="button"
                    onClick={handleMatchCandidates}
                    disabled={matching}
                    className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/50 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {matching ? "Analyzing..." : "Match Candidates"}
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <section className="mt-8 overflow-hidden rounded-[28px] border border-slate-800 bg-[#0f172a] shadow-[0_16px_60px_rgba(2,6,23,0.3)]">
          <div className="flex flex-col gap-5 border-b border-slate-800 px-6 py-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Screening Results</h2>
              <p className="mt-1 text-sm text-slate-400">{activeJob ? activeJob.title : "Process a JD to populate ranked candidates."}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select value={recommendationFilter} onChange={(event) => setRecommendationFilter(event.target.value as (typeof recommendationFilters)[number])} className="rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none">
                {recommendationFilters.map((filter) => <option key={filter} value={filter}>{filter === "ALL" ? "All Recommendations" : filter}</option>)}
              </select>
              <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as (typeof riskFilters)[number])} className="rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none">
                {riskFilters.map((filter) => <option key={filter} value={filter}>{filter === "ALL" ? "All Risk Levels" : filter}</option>)}
              </select>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as "score" | "recent")} className="rounded-xl border border-slate-700 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none">
                <option value="score">Top Score</option>
                <option value="recent">Most Recent</option>
              </select>
              <button
                type="button"
                onClick={() => handleSendInterviews("STRONG_FIT")}
                disabled={sending || !activeJob || matches.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SendIcon />
                Send to STRONG_FIT
              </button>
              <div className="flex items-center overflow-hidden rounded-xl border border-slate-700 bg-slate-950/50">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={topN}
                  onChange={(event) => setTopN(Number(event.target.value))}
                  className="w-16 bg-transparent px-3 py-2 text-sm text-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleSendInterviews("TOP_N")}
                  disabled={sending || !activeJob || matches.length === 0}
                  className="border-l border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send Top N
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] table-fixed text-sm">
              <colgroup>
                <col className="w-[220px]" />
                <col className="w-[230px]" />
                <col className="w-[120px]" />
                <col className="w-[130px]" />
                <col className="w-[160px]" />
                <col className="w-[300px]" />
                <col className="w-[180px]" />
              </colgroup>
              <thead className="bg-slate-950/20 text-slate-400">
                <tr>
                  <th className="p-5 text-left font-medium">Candidate Name</th>
                  <th className="p-5 text-left font-medium">Email</th>
                  <th className="p-5 text-left font-medium">Match Score</th>
                  <th className="p-5 text-left font-medium">Risk Level</th>
                  <th className="p-5 text-left font-medium">Recommendation</th>
                  <th className="p-5 text-left font-medium">Insights</th>
                  <th className="p-5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMatches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-10 text-center text-slate-400">
                      {matching ? "Analyzing candidates..." : "No candidate matches available"}
                    </td>
                  </tr>
                ) : (
                  filteredMatches.map((match) => (
                    <tr key={match.id} className="border-t border-slate-800/80 align-top text-slate-200">
                      <td className="p-5 font-medium text-white">{match.candidateName}</td>
                      <td className="p-5">
                        {editingCandidateId === match.candidateId ? (
                          <div className="flex gap-2">
                            <input
                              value={emailDraft}
                              onChange={(event) => setEmailDraft(event.target.value)}
                              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/60"
                              placeholder="candidate@email.com"
                            />
                            <button type="button" onClick={() => handleSaveEmail(match.candidateId)} className="rounded-xl border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-100">
                              Save
                            </button>
                          </div>
                        ) : match.email ? (
                          <span className="text-slate-200">{match.email}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCandidateId(match.candidateId)
                              setEmailDraft("")
                            }}
                            className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200 transition hover:border-amber-300/40"
                          >
                            No Email ⚠️
                          </button>
                        )}
                      </td>
                      <td className={`p-5 text-xl font-semibold ${getScoreColor(match.matchScore)}`}>{match.matchScore}%</td>
                      <td className="p-5">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getRiskTone(match.riskLevel)}`}>
                          {match.riskLevel}
                        </span>
                      </td>
                      <td className="p-5">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getRecommendationTone(match.recommendation)}`}>
                          {match.recommendation}
                        </span>
                      </td>
                      <td className="p-5 text-slate-400">
                        <div className="line-clamp-3 leading-6">
                          {match.insights?.short_reasoning || "-"}
                        </div>
                      </td>
                      <td className="p-5 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCandidateId(match.candidateId)
                              setEmailDraft(match.email ?? "")
                            }}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900/80 text-slate-300 transition hover:border-blue-400/40 hover:bg-blue-500/10 hover:text-blue-100"
                            aria-label={`Edit email for ${match.candidateName}`}
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendInterviews("SELECTED", [match.candidateId])}
                            disabled={sending || !match.email}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-100 transition hover:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Send interview to ${match.candidateName}`}
                          >
                            <SendIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {sendResults.length > 0 ? (
          <section className="mt-8 rounded-[28px] border border-slate-800 bg-[#0f172a] p-6 shadow-[0_16px_60px_rgba(2,6,23,0.3)]">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Interview Dispatch</h2>
              <button type="button" onClick={() => setSendResults([])} className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white">
                Clear
              </button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sendResults.map((result) => (
                <div key={`${result.candidateId}-${result.status}`} className="rounded-2xl border border-slate-800 bg-slate-950/30 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{result.candidateName}</p>
                      <p className="mt-1 truncate text-sm text-slate-500">{result.email || result.error || "No email"}</p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] ${result.status === "SENT" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : result.status === "SKIPPED" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : "border-rose-500/20 bg-rose-500/10 text-rose-300"}`}>
                      {result.status}
                    </span>
                  </div>
                  {result.inviteLink ? (
                    <Link href={result.inviteLink} className="mt-3 block truncate text-sm text-cyan-300 transition hover:text-cyan-200">
                      {result.inviteLink}
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <SendInterviewModal isOpen={openSendInterview} onClose={() => setOpenSendInterview(false)} />
    </div>
  )
}
