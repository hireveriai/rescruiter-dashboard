"use client"

import Link from "next/link"
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react"

import Navbar from "@/components/Navbar"
import SendInterviewModal from "@/components/SendInterviewModal"
import { InsightTooltip } from "@/components/ui/InsightTooltip"
import { ProcessingTimeline, type TimelineStep } from "@/components/ui/ProcessingTimeline"
import { StepProgress } from "@/components/ui/StepProgress"
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
  sourceJobPositionId?: string | null
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
  status: "uploading" | "uploaded" | "processing" | "ready" | "failed"
  candidateId: string | null
  uploadBatchId: string | null
  name: string | null
  email: string | null
  error: string | null
}

type ResumeDisplayStatus = "UPLOADING" | "UPLOADED" | "PROCESSING" | "READY" | "FAILED"

type ResumeDisplayRow = {
  id: string
  fileName: string
  fileSizeKb: number | null
  name: string | null
  email: string | null
  error: string | null
  status: ResumeDisplayStatus
}

type SendResult = {
  candidateId: string
  candidateName: string
  email: string | null
  status: "SENT" | "FAILED" | "SKIPPED"
  error: string | null
  inviteLink: string | null
}

type InterviewAccessType = "FLEXIBLE" | "SCHEDULED"
type CandidateScheduleDraft = {
  startTime: string
  endTime: string
}
type CandidateInterviewSchedule = {
  candidateId: string
  accessType: InterviewAccessType
  startTime: string | null
  endTime: string | null
}

type FlowStep =
  | "UPLOAD"
  | "JD_READY"
  | "JD_PROCESSED"
  | "MATCH_READY"
  | "MATCHED"

type MatchScope = "BATCH" | "GLOBAL"
type PipelineErrorStep = "upload" | "parse" | "job" | "match" | null
type CleanupModal = "CLEAR_RESULTS" | "DELETE_UPLOAD" | null

const recommendationFilters = ["ALL", "STRONG_FIT", "POTENTIAL", "WEAK", "REJECT"] as const
const riskFilters = ["ALL", "LOW", "MEDIUM", "HIGH"] as const
const FLOW_STORAGE_KEY = "hireveri.aiScreening.flowState"
const AUTO_RUN = true

type StoredFlowState = {
  flowStep: FlowStep
  currentBatchId: string
  uploadedCandidateIds: string[]
  activeJobId: string
  selectedExistingJobId: string
  matchScope: MatchScope
  includeAllCandidates: boolean
}

function isFlowStep(value: unknown): value is FlowStep {
  return (
    value === "UPLOAD" ||
    value === "JD_READY" ||
    value === "JD_PROCESSED" ||
    value === "MATCH_READY" ||
    value === "MATCHED"
  )
}

function getDefaultFlowState(): StoredFlowState {
  return {
    flowStep: "UPLOAD",
    currentBatchId: "",
    uploadedCandidateIds: [],
    activeJobId: "",
    selectedExistingJobId: "",
    matchScope: "BATCH",
    includeAllCandidates: false,
  }
}

function readStoredFlowState(): StoredFlowState {
  if (typeof window === "undefined") {
    return getDefaultFlowState()
  }

  try {
    const rawValue = window.sessionStorage.getItem(FLOW_STORAGE_KEY)
    const parsed = rawValue ? JSON.parse(rawValue) as Record<string, unknown> : {}

    const currentBatchId = typeof parsed.currentBatchId === "string" ? parsed.currentBatchId : ""
    const uploadedCandidateIds = Array.isArray(parsed.uploadedCandidateIds)
      ? parsed.uploadedCandidateIds.filter((value): value is string => typeof value === "string" && value.length > 0)
      : []
    const parsedFlowStep = isFlowStep(parsed.flowStep) ? parsed.flowStep : "UPLOAD"
    const parsedMatchScope = parsed.matchScope === "GLOBAL" || parsed.match_scope === "GLOBAL" || parsed.includeAllCandidates === true
      ? "GLOBAL"
      : "BATCH"

    return {
      flowStep: currentBatchId ? parsedFlowStep : "UPLOAD",
      currentBatchId,
      uploadedCandidateIds,
      activeJobId: typeof parsed.activeJobId === "string" ? parsed.activeJobId : "",
      selectedExistingJobId: typeof parsed.selectedExistingJobId === "string" ? parsed.selectedExistingJobId : "",
      matchScope: parsedMatchScope,
      includeAllCandidates: parsedMatchScope === "GLOBAL" || parsed.includeAllCandidates === true,
    }
  } catch {
    return getDefaultFlowState()
  }
}

function getMatchScope(includeAllCandidates: boolean): MatchScope {
  return includeAllCandidates ? "GLOBAL" : "BATCH"
}

function isResumeReady(row: UploadRow) {
  return row.status === "ready" || row.status === "uploaded"
}

function getResumeStatusLabel(status: ResumeDisplayStatus) {
  switch (status) {
    case "UPLOADING":
      return "Uploading..."
    case "UPLOADED":
      return "Uploaded"
    case "PROCESSING":
      return "Processing..."
    case "READY":
      return "Ready"
    case "FAILED":
      return "Failed"
  }
}

function getResumeStatusClass(status: ResumeDisplayStatus) {
  switch (status) {
    case "UPLOADING":
      return "border-blue-500/25 bg-blue-500/10 text-blue-200"
    case "UPLOADED":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-200"
    case "PROCESSING":
      return "border-amber-500/25 bg-amber-500/10 text-amber-200"
    case "READY":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
    case "FAILED":
      return "border-rose-500/25 bg-rose-500/10 text-rose-300"
  }
}

function getDateTimeValue(value: string) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date
}

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

function MoreIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 12h.01" />
      <path d="M19 12h.01" />
      <path d="M5 12h.01" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 text-cyan-300/80" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4" />
      <path d="M8 3v4" />
      <path d="M3 10h18" />
    </svg>
  )
}

function DateTimeField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div>
      <label className="mb-2 block text-xs font-medium text-slate-400">{label}</label>
      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          <CalendarIcon />
        </div>
        <input
          type="datetime-local"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-10 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400/60 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </div>
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

function getRecommendationTextTone(recommendation: MatchRow["recommendation"]) {
  if (recommendation === "STRONG_FIT") {
    return "text-emerald-300"
  }

  if (recommendation === "POTENTIAL") {
    return "text-blue-300"
  }

  if (recommendation === "WEAK") {
    return "text-amber-300"
  }

  return "text-rose-300"
}

function getRecommendationLabel(recommendation: MatchRow["recommendation"] | "ALL" | "POTENTIAL_FIT") {
  if (recommendation === "ALL") {
    return "All Recommendations"
  }

  if (recommendation === "STRONG_FIT") {
    return "STRONG FIT"
  }

  if (recommendation === "POTENTIAL" || recommendation === "POTENTIAL_FIT") {
    return "POTENTIAL FIT"
  }

  return recommendation
}

function getRecommendationDisplayLabel(recommendation: MatchRow["recommendation"]) {
  if (recommendation === "STRONG_FIT") {
    return "Strong Fit"
  }

  if (recommendation === "POTENTIAL") {
    return "Potential"
  }

  if (recommendation === "WEAK") {
    return "Weak"
  }

  return "Reject"
}

function isAiRecommendedForInterview(match: MatchRow) {
  if (match.riskLevel === "HIGH") {
    return false
  }

  return match.matchScore >= 80 && match.riskLevel === "LOW"
}

function getDefaultSelectedCandidateIds(matches: MatchRow[]) {
  return matches
    .filter(isAiRecommendedForInterview)
    .map((match) => match.candidateId)
}

function filterMatchesToCandidateScope(matches: MatchRow[], candidateIds: string[]) {
  const scopedCandidateIds = new Set(candidateIds.filter(Boolean))

  if (scopedCandidateIds.size === 0) {
    return matches
  }

  return matches.filter((match) => scopedCandidateIds.has(match.candidateId))
}

function getCandidateRankValue(match: MatchRow) {
  const riskPenalty = match.riskLevel === "HIGH" ? 35 : match.riskLevel === "MEDIUM" ? 12 : 0

  return match.matchScore + Math.round((match.skillMatch + match.experienceMatch) / 10) - riskPenalty
}

function getCandidateStrengths(match: MatchRow) {
  const strengths: string[] = []

  if (match.matchScore >= 80) {
    strengths.push(`High overall match at ${match.matchScore}%`)
  }

  if (match.skillMatch >= 80) {
    strengths.push(`Strong skill alignment at ${match.skillMatch}%`)
  }

  if (match.experienceMatch >= 80) {
    strengths.push(`Experience closely matches the role at ${match.experienceMatch}%`)
  }

  if (match.riskLevel === "LOW") {
    strengths.push("Low risk profile")
  }

  if (match.recommendation === "STRONG_FIT") {
    strengths.push("AI marked as a strong fit")
  }

  return strengths.length > 0 ? strengths : ["No standout strength flagged by the AI screen"]
}

function getCandidateWeaknesses(match: MatchRow) {
  const weaknesses = Array.isArray(match.insights?.missing_skills) && match.insights.missing_skills.length > 0
    ? match.insights.missing_skills.map((skill) => `Missing ${skill}`)
    : []

  if (match.skillMatch < 65) {
    weaknesses.push(`Skill match is ${match.skillMatch}%`)
  }

  if (match.experienceMatch < 65) {
    weaknesses.push(`Experience match is ${match.experienceMatch}%`)
  }

  if (match.riskLevel === "HIGH") {
    weaknesses.push("High risk candidate. Review carefully before sending.")
  } else if (match.riskLevel === "MEDIUM") {
    weaknesses.push("Medium risk profile")
  }

  return weaknesses.length > 0 ? weaknesses : ["No major weakness surfaced by the AI screen"]
}

function getCandidateVerdict(match: MatchRow) {
  if (isAiRecommendedForInterview(match)) {
    return "Advance to interview"
  }

  if (match.riskLevel === "HIGH") {
    return "Review carefully before any outreach"
  }

  if (match.matchScore >= 65 || match.recommendation === "POTENTIAL") {
    return "Keep as a backup candidate"
  }

  return "Do not prioritize for this role"
}

function getConfidenceLevel(match: MatchRow): "HIGH" | "MEDIUM" | "LOW" {
  if (match.matchScore >= 82 && match.skillMatch >= 75 && match.experienceMatch >= 70 && match.riskLevel === "LOW") {
    return "HIGH"
  }

  if (match.matchScore >= 62 && match.riskLevel !== "HIGH") {
    return "MEDIUM"
  }

  return "LOW"
}

function getConfidenceTone(confidence: "HIGH" | "MEDIUM" | "LOW") {
  if (confidence === "HIGH") {
    return "text-emerald-300"
  }

  if (confidence === "MEDIUM") {
    return "text-blue-300"
  }

  return "text-amber-300"
}

function getConfidenceLabel(confidence: "HIGH" | "MEDIUM" | "LOW") {
  return confidence.charAt(0) + confidence.slice(1).toLowerCase()
}

function buildComparisonInsight(matches: MatchRow[]) {
  if (matches.length < 2) {
    return ""
  }

  const ranked = [...matches].sort((left, right) => getCandidateRankValue(right) - getCandidateRankValue(left))
  const best = ranked[0]
  const challenger = ranked[1]
  const reasons = [
    best.matchScore >= challenger.matchScore
      ? `${best.candidateName} has a higher match score (${best.matchScore}% vs ${challenger.matchScore}%).`
      : `${best.candidateName} has a stronger risk-adjusted profile despite a lower match score.`,
    best.riskLevel !== "HIGH" && challenger.riskLevel === "HIGH"
      ? `${challenger.candidateName} is high risk, while ${best.candidateName} is safer to advance.`
      : `${best.candidateName} carries ${best.riskLevel.toLowerCase()} risk compared with ${challenger.candidateName}'s ${challenger.riskLevel.toLowerCase()} risk.`,
    best.skillMatch >= challenger.skillMatch
      ? `${best.candidateName} has stronger skill alignment.`
      : `${challenger.candidateName} has stronger skill alignment, so review role-critical skills before deciding.`,
  ]

  return `Why ${best.candidateName} is better than ${challenger.candidateName}: ${reasons.join(" ")}`
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
  const resultsSectionRef = useRef<HTMLElement>(null)
  const defaultFlowState = getDefaultFlowState()
  const [openSendInterview, setOpenSendInterview] = useState(false)
  const [existingJobs, setExistingJobs] = useState<ExistingJob[]>([])
  const [screeningJobs, setScreeningJobs] = useState<ScreeningJob[]>([])
  const [selectedExistingJobId, setSelectedExistingJobId] = useState(defaultFlowState.selectedExistingJobId)
  const [activeJob, setActiveJob] = useState<ScreeningJob | null>(null)
  const [createJobModalOpen, setCreateJobModalOpen] = useState(false)
  const [newJobTitle, setNewJobTitle] = useState("")
  const [newJobDescription, setNewJobDescription] = useState("")
  const [newJobError, setNewJobError] = useState("")
  const [files, setFiles] = useState<File[]>([])
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([])
  const [flowStep, setFlowStep] = useState<FlowStep>(defaultFlowState.flowStep)
  const [currentBatchId, setCurrentBatchId] = useState(defaultFlowState.currentBatchId)
  const [uploadedCandidateIds, setUploadedCandidateIds] = useState<string[]>(defaultFlowState.uploadedCandidateIds)
  const [restoredActiveJobId, setRestoredActiveJobId] = useState(defaultFlowState.activeJobId)
  const [restoredFlowStep, setRestoredFlowStep] = useState<FlowStep>(defaultFlowState.flowStep)
  const [includeAllCandidates, setIncludeAllCandidates] = useState(defaultFlowState.includeAllCandidates)
  const [flowStateHydrated, setFlowStateHydrated] = useState(false)
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([])
  const [compareCandidateIds, setCompareCandidateIds] = useState<string[]>([])
  const [compareModalOpen, setCompareModalOpen] = useState(false)
  const [pendingSendCandidateIds, setPendingSendCandidateIds] = useState<string[]>([])
  const [confirmSendOpen, setConfirmSendOpen] = useState(false)
  const [sendAccessType, setSendAccessType] = useState<InterviewAccessType>("FLEXIBLE")
  const [defaultScheduleStartTime, setDefaultScheduleStartTime] = useState("")
  const [defaultScheduleEndTime, setDefaultScheduleEndTime] = useState("")
  const [customScheduleEnabled, setCustomScheduleEnabled] = useState(false)
  const [customScheduleExpanded, setCustomScheduleExpanded] = useState(false)
  const [candidateScheduleDrafts, setCandidateScheduleDrafts] = useState<Record<string, CandidateScheduleDraft>>({})
  const [sendScheduleError, setSendScheduleError] = useState("")
  const [cleanupMenuOpen, setCleanupMenuOpen] = useState(false)
  const [cleanupModal, setCleanupModal] = useState<CleanupModal>(null)
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("")
  const [cleanupBusy, setCleanupBusy] = useState(false)
  const [recommendationFilter, setRecommendationFilter] = useState<(typeof recommendationFilters)[number]>("ALL")
  const [riskFilter, setRiskFilter] = useState<(typeof riskFilters)[number]>("ALL")
  const [sortMode, setSortMode] = useState<"score" | "recent">("score")
  const [topN, setTopN] = useState(10)
  const [dragActive, setDragActive] = useState(false)
  const [isProcessingJD, setIsProcessingJD] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isMatching, setIsMatching] = useState(false)
  const [savingNewJob, setSavingNewJob] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [pipelineErrorStep, setPipelineErrorStep] = useState<PipelineErrorStep>(null)
  const [editingCandidateId, setEditingCandidateId] = useState("")
  const [emailDraft, setEmailDraft] = useState("")
  const [sendResults, setSendResults] = useState<SendResult[]>([])

  useEffect(() => {
    const storedFlowState = readStoredFlowState()
    setFlowStep(storedFlowState.flowStep)
    setCurrentBatchId(storedFlowState.currentBatchId)
    setUploadedCandidateIds(storedFlowState.uploadedCandidateIds)
    setRestoredActiveJobId(storedFlowState.activeJobId)
    setSelectedExistingJobId(storedFlowState.selectedExistingJobId)
    setRestoredFlowStep(storedFlowState.flowStep)
    setIncludeAllCandidates(storedFlowState.includeAllCandidates)
    setFlowStateHydrated(true)
  }, [])

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
          const restoredJob = flowStateHydrated
            ? jobs.find((job: ScreeningJob) => job.id === restoredActiveJobId)
            : null
          setScreeningJobs(jobs)
          if (restoredJob) {
            setActiveJob(restoredJob)
            setSelectedExistingJobId((current) => current || restoredJob.sourceJobPositionId || restoredJob.id)
          } else if (flowStateHydrated && jobs.length > 0 && restoredFlowStep === "MATCHED") {
            setActiveJob(jobs[0])
            setSelectedExistingJobId((current) => current || jobs[0].sourceJobPositionId || jobs[0].id)
          }
        }
      } catch (loadError) {
        console.error("Failed to load VERIS screening data", loadError)
      }
    }

    loadInitialData()

    return () => {
      active = false
    }
  }, [flowStateHydrated, restoredActiveJobId, restoredFlowStep, searchParams])

  useEffect(() => {
    if (!flowStateHydrated || typeof window === "undefined") {
      return
    }

    const activeJobIdForStorage = activeJob?.id ?? restoredActiveJobId

    window.sessionStorage.setItem(
      FLOW_STORAGE_KEY,
      JSON.stringify({
        flowStep,
        currentBatchId,
        uploadedCandidateIds,
        activeJobId: activeJobIdForStorage,
        selectedExistingJobId,
        matchScope: getMatchScope(includeAllCandidates),
        includeAllCandidates,
      })
    )
  }, [activeJob?.id, currentBatchId, flowStateHydrated, flowStep, includeAllCandidates, restoredActiveJobId, selectedExistingJobId, uploadedCandidateIds])

  useEffect(() => {
    const activeJobId = activeJob?.id

    if (!activeJobId) {
      return
    }
    const jobIdForRequest = activeJobId

    if (flowStep !== "MATCHED") {
      setMatches([])
      setSelectedCandidateIds([])
      setCompareCandidateIds([])
      return
    }

    if (!includeAllCandidates && !currentBatchId && uploadedCandidateIds.length === 0) {
      setMatches([])
      setSelectedCandidateIds([])
      setCompareCandidateIds([])
      return
    }

    let active = true

    async function loadMatches() {
      try {
        const params = new URLSearchParams({ job_id: jobIdForRequest })
        params.set("matchScope", getMatchScope(includeAllCandidates))

        if (includeAllCandidates) {
          params.set("includeAllCandidates", "true")
        } else {
          if (currentBatchId) {
            params.set("batchId", currentBatchId)
          }

          if (uploadedCandidateIds.length > 0) {
            params.set("candidateIds", uploadedCandidateIds.join(","))
          }

          const uploadFileNames = uploadRows
            .map((row) => row.fileName)
            .filter(Boolean)

          if (uploadFileNames.length > 0) {
            params.set("uploadFileNames", uploadFileNames.join(","))
          }
        }

        const response = await fetch(authUrl(`/api/match-candidates?${params.toString()}`), {
          credentials: "include",
          cache: "no-store",
        })
        const payload = await response.json()

        if (active && payload.success) {
          const rowCandidateIds = uploadRows
            .filter((row) => isResumeReady(row) && row.candidateId)
            .map((row) => row.candidateId as string)
          const scopeCandidateIds = includeAllCandidates || currentBatchId ? [] : [...new Set([...uploadedCandidateIds, ...rowCandidateIds])]
          const loadedMatches = filterMatchesToCandidateScope(payload.data?.matches ?? [], scopeCandidateIds)
          setMatches((currentMatches) => loadedMatches.length === 0 && currentMatches.length > 0 ? currentMatches : loadedMatches)
          if (loadedMatches.length > 0) {
            setSelectedCandidateIds(getDefaultSelectedCandidateIds(loadedMatches))
          }
        }
      } catch (loadError) {
        console.error("Failed to load match results", loadError)
      }
    }

    loadMatches()

    return () => {
      active = false
    }
  }, [activeJob?.id, currentBatchId, flowStep, includeAllCandidates, searchParams, uploadRows, uploadedCandidateIds])

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
  const selectedCandidateIdSet = useMemo(
    () => new Set(selectedCandidateIds),
    [selectedCandidateIds]
  )
  const compareCandidateIdSet = useMemo(
    () => new Set(compareCandidateIds),
    [compareCandidateIds]
  )
  const recommendedCount = useMemo(
    () => matches.filter(isAiRecommendedForInterview).length,
    [matches]
  )
  const decisionSummary = useMemo(() => {
    const totalCandidates = matches.length
    const topMatches = matches
      .filter(isAiRecommendedForInterview)
      .sort((left, right) => right.matchScore - left.matchScore)
    const borderlineCandidates = matches.filter((match) => {
      return !isAiRecommendedForInterview(match) && match.riskLevel !== "HIGH" && match.matchScore >= 60
    }).length
    const rejectedCandidates = matches.filter((match) => {
      return match.recommendation === "REJECT" || match.riskLevel === "HIGH" || match.matchScore < 45
    }).length
    const reviewCandidates = Math.max(0, totalCandidates - topMatches.length - rejectedCandidates)
    const commonGaps = matches
      .flatMap((match) => Array.isArray(match.insights?.missing_skills) ? match.insights.missing_skills : [])
      .slice(0, 4)

    return {
      totalCandidates,
      topMatches,
      strongMatches: topMatches.length,
      borderlineCandidates,
      rejectedCandidates,
      reviewCandidates,
      commonGaps,
    }
  }, [matches])
  const comparisonMatches = useMemo(
    () => compareCandidateIds
      .map((candidateId) => matches.find((match) => match.candidateId === candidateId))
      .filter((match): match is MatchRow => Boolean(match))
      .slice(0, 4),
    [compareCandidateIds, matches]
  )
  const comparisonInsight = useMemo(
    () => buildComparisonInsight(comparisonMatches),
    [comparisonMatches]
  )
  const selectedMatches = useMemo(
    () => matches.filter((match) => selectedCandidateIdSet.has(match.candidateId)),
    [matches, selectedCandidateIdSet]
  )
  const selectedCount = selectedMatches.length
  const selectedMissingEmailCount = selectedMatches.filter((match) => !match.email).length
  const pendingSendMatches = useMemo(
    () => matches.filter((match) => pendingSendCandidateIds.includes(match.candidateId)),
    [matches, pendingSendCandidateIds]
  )
  const pendingSendMissingEmailCount = pendingSendMatches.filter((match) => !match.email).length
  const shouldCollapseCustomSchedule = customScheduleEnabled && pendingSendMatches.length > 10 && !customScheduleExpanded
  const uploadedResumeCount = uploadRows.filter(isResumeReady).length
  const resumeDisplayRows = useMemo<ResumeDisplayRow[]>(() => {
    const fileSizeByName = new Map(files.map((file) => [file.name, Math.max(1, Math.round(file.size / 1024))]))

    if (uploadRows.length > 0) {
      return uploadRows.map((row) => ({
        id: row.candidateId ?? row.fileName,
        fileName: row.fileName,
        fileSizeKb: fileSizeByName.get(row.fileName) ?? null,
        name: row.name,
        email: row.email,
        error: row.error,
        status:
          row.status === "failed"
            ? "FAILED"
            : row.status === "uploading"
              ? "UPLOADING"
              : row.status === "processing"
                ? "PROCESSING"
                : row.status === "uploaded"
                  ? "UPLOADED"
                  : "READY",
      }))
    }

    if (!uploading) {
      return []
    }

    return files.map((file) => ({
      id: `${file.name}-${file.size}`,
      fileName: file.name,
      fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
      name: null,
      email: null,
      error: null,
      status: "UPLOADING",
    }))
  }, [files, uploadRows, uploading])

  const selectedExistingJob = useMemo(
    () => existingJobs.find((job) => job.jobId === selectedExistingJobId) ?? null,
    [existingJobs, selectedExistingJobId]
  )
  const hasUploadedResumes = Boolean(currentBatchId)
  const hasSelectedJob = Boolean(selectedExistingJobId)
  const isBusy = uploading || isProcessingJD || isMatching || savingNewJob || sending || cleanupBusy
  const canShowCleanupActions = matches.length > 0 || Boolean(currentBatchId) || uploadedCandidateIds.length > 0
  const canAnalyzeJob = hasUploadedResumes && hasSelectedJob && flowStep !== "JD_PROCESSED" && flowStep !== "MATCHED" && !isBusy
  const canRunMatching = Boolean(
    activeJob &&
      hasUploadedResumes &&
      (flowStep === "JD_PROCESSED" || flowStep === "MATCHED") &&
      !isBusy
  )
  const analyzeHelpText = canAnalyzeJob
    ? ""
    : !hasSelectedJob
      ? "Select or create a job first"
      : !hasUploadedResumes
        ? "Upload resumes before analyzing the job"
        : "Job is already analyzed. Run matching next."
  const matchHelpText = canRunMatching ? "" : "Analyze job description to enable matching"
  const processingStatusText = isMatching
    ? "Matching candidates..."
    : isProcessingJD
      ? "Analyzing job..."
      : uploading
        ? "Uploading and parsing resumes..."
        : savingNewJob
          ? "Saving job description..."
          : sending
            ? "Sending interview invitations..."
            : "Processing"
  const timelineSteps = useMemo<TimelineStep[]>(() => {
    const uploadComplete = Boolean(currentBatchId)
    const jobComplete = Boolean(activeJob && (flowStep === "JD_PROCESSED" || flowStep === "MATCHED"))
    const matchingComplete = flowStep === "MATCHED"

    return [
      {
        label: "Resume uploaded",
        status: pipelineErrorStep === "upload" ? "error" : uploadComplete ? "completed" : uploading ? "active" : "pending",
      },
      {
        label: "Resume parsed",
        status: pipelineErrorStep === "parse" ? "error" : uploadComplete ? "completed" : "pending",
      },
      {
        label: "Job analyzed",
        status: pipelineErrorStep === "job" ? "error" : jobComplete ? "completed" : isProcessingJD ? "active" : "pending",
      },
      {
        label: "Matching candidates",
        status: pipelineErrorStep === "match" ? "error" : matchingComplete ? "completed" : isMatching ? "active" : "pending",
      },
      {
        label: "Results ready",
        status: matchingComplete ? "completed" : "pending",
      },
    ]
  }, [activeJob, currentBatchId, flowStep, isMatching, isProcessingJD, pipelineErrorStep, uploading])
  const timelineErrorLabel = pipelineErrorStep ? error || "Pipeline paused. Fix the issue and retry." : ""

  function setSelectedFiles(fileList: FileList | File[]) {
    const nextFiles = Array.from(fileList).filter((file) => /\.(pdf|docx)$/i.test(file.name))
    setFiles(nextFiles)
    setUploadRows([])
    setCurrentBatchId("")
    setUploadedCandidateIds([])
    setActiveJob(null)
    setRestoredActiveJobId("")
    setMatches([])
    setSelectedCandidateIds([])
    setCompareCandidateIds([])
    setSendResults([])
    setFlowStep("UPLOAD")
    setPipelineErrorStep(null)
    setError("")
    setNotice(nextFiles.length ? `${nextFiles.length} resume${nextFiles.length === 1 ? "" : "s"} ready for upload.` : "")
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (isBusy) {
      return
    }

    if (event.target.files) {
      setSelectedFiles(event.target.files)
    }
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragActive(false)
    if (isBusy) {
      return
    }
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
      setPipelineErrorStep(null)
      setNotice("Uploading and parsing resumes...")
      setUploadRows(files.map((file) => ({
        fileName: file.name,
        status: "uploading",
        candidateId: null,
        uploadBatchId: null,
        name: null,
        email: null,
        error: null,
      })))
      const formData = new FormData()
      files.forEach((file) => formData.append("files", file))
      const response = await fetch(authUrl("/api/upload-resumes"), {
        method: "POST",
        credentials: "include",
        body: formData,
      })
      const payload = await response.json().catch(() => null)
      const rows = ((payload?.data?.results ?? []) as UploadRow[]).map((row) => ({
        ...row,
        status: row.status === "uploaded" ? "ready" : row.status,
      }))
      const batchId = payload?.data?.batchId ?? ""
      const uploadedCount = payload?.data?.uploadedCount ?? 0
      const candidateIds = rows
        .filter((row) => isResumeReady(row) && row.candidateId)
        .map((row) => row.candidateId as string)
      setUploadRows(rows)

      if (!response.ok || !payload?.success) {
        const firstFailure = rows.find((row: UploadRow) => row.status === "failed" && row.error)
        throw new Error(
          payload?.error?.message ||
            payload?.message ||
            firstFailure?.error ||
            "Resume upload failed"
        )
      }

      setCurrentBatchId(batchId)
      setUploadedCandidateIds(candidateIds)
      setIncludeAllCandidates(false)
      setMatches([])
      setSelectedCandidateIds([])
      setCompareCandidateIds([])
      setSendResults([])
      setFlowStep("JD_READY")
      setNotice(`${uploadedCount} resumes parsed and saved. Select a job and analyze it next.`)

      if (AUTO_RUN && batchId && uploadedCount > 0 && hasSelectedJob && !isProcessingJD && !isMatching) {
        const job = await processJobIntelligence({ batchId, runMatchAfter: false })

        if (job) {
          await runMatching(job, {
            batchId,
            candidateIds,
            includeAllCandidates: false,
            skipFlowGuard: true,
          })
        }
      }
    } catch (uploadError) {
      setPipelineErrorStep("upload")
      setError(uploadError instanceof Error ? uploadError.message : "Resume upload failed")
    } finally {
      setUploading(false)
    }
  }

  async function handleCreatePastedJob() {
    const description = newJobDescription.trim()
    const title = newJobTitle.trim()

    if (!description) {
      setNewJobError("Paste a job description to create a job.")
      return
    }

    try {
      setSavingNewJob(true)
      setError("")
      setNewJobError("")
      setPipelineErrorStep(null)
      setNotice("Saving job description...")
      const response = await fetch(authUrl("/api/process-jd"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || undefined,
          description,
        }),
      })
      const payload = await readJsonResponse(response)
      const job = payload.data as ScreeningJob
      const existingJob: ExistingJob = {
        jobId: job.id,
        jobTitle: job.title,
        jobDescription: job.description,
        coreSkills: job.requiredSkills,
        isActive: true,
      }

      setExistingJobs((current) => [existingJob, ...current.filter((item) => item.jobId !== job.id)])
      setSelectedExistingJobId(job.id)
      setActiveJob(job)
      setRestoredActiveJobId(job.id)
      setScreeningJobs((current) => [job, ...current.filter((item) => item.id !== job.id)])
      setMatches([])
      setSelectedCandidateIds([])
      setCompareCandidateIds([])
      setSendResults([])
      setCreateJobModalOpen(false)
      setNewJobTitle("")
      setNewJobDescription("")
      setFlowStep(hasUploadedResumes ? "JD_PROCESSED" : "UPLOAD")
      setNotice(hasUploadedResumes ? "Job created and analyzed. Ready to match candidates." : "Job created. Upload resumes to continue.")
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Could not create job description"
      setNewJobError(message)
      setError(message)
    } finally {
      setSavingNewJob(false)
    }
  }

  async function processJobIntelligence(options?: {
    batchId?: string
    runMatchAfter?: boolean
  }): Promise<ScreeningJob | null> {
    const batchId = options?.batchId ?? currentBatchId

    if (!batchId) {
      setError("Upload resumes and select a job first")
      setPipelineErrorStep("upload")
      return null
    }

    if (!hasSelectedJob) {
      setError("Select or create a job first")
      setPipelineErrorStep("job")
      return null
    }

    try {
      setIsProcessingJD(true)
      setError("")
      setPipelineErrorStep(null)
      setNotice("Analyzing job...")
      const response = await fetch(authUrl("/api/process-jd"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          existingJobId: selectedExistingJobId,
          title: selectedExistingJob?.jobTitle || undefined,
          description: selectedExistingJob?.jobDescription || undefined,
        }),
      })
      const payload = await readJsonResponse(response)
      const job = payload.data as ScreeningJob
      setActiveJob(job)
      setRestoredActiveJobId(job.id)
      setScreeningJobs((current) => [job, ...current.filter((item) => item.id !== job.id)])
      setMatches([])
      setSelectedCandidateIds([])
      setCompareCandidateIds([])
      setSendResults([])
      setFlowStep("JD_PROCESSED")
      setNotice("Job analyzed successfully. Ready to match candidates.")

      if (options?.runMatchAfter) {
        setIsProcessingJD(false)
        await runMatching(job, {
          batchId,
          includeAllCandidates,
          skipFlowGuard: true,
        })
      }

      return job
    } catch (processError) {
      setPipelineErrorStep("job")
      setError(processError instanceof Error ? processError.message : "Could not process job description")
      return null
    } finally {
      setIsProcessingJD(false)
    }
  }

  async function handleProcessJob() {
    await processJobIntelligence({ runMatchAfter: AUTO_RUN })
  }

  async function runMatching(
    job: ScreeningJob,
    options?: {
      batchId?: string
      candidateIds?: string[]
      includeAllCandidates?: boolean
      skipFlowGuard?: boolean
    }
  ) {
    const batchId = options?.batchId ?? currentBatchId
    const rowCandidateIds = uploadRows
      .filter((row) => isResumeReady(row) && row.candidateId)
      .map((row) => row.candidateId as string)
    const candidateIds = options?.candidateIds ?? (uploadedCandidateIds.length > 0 ? uploadedCandidateIds : rowCandidateIds)
    const includeAll = options?.includeAllCandidates ?? includeAllCandidates
    const uploadFileNames = uploadRows.length > 0
      ? uploadRows.map((row) => row.fileName).filter(Boolean)
      : files.map((file) => file.name).filter(Boolean)

    if (!job) {
      setError("Process a job description before matching candidates.")
      setPipelineErrorStep("job")
      return false
    }

    if (!options?.skipFlowGuard && flowStep !== "JD_PROCESSED" && flowStep !== "MATCHED") {
      setError("Process JD first")
      setPipelineErrorStep("job")
      return false
    }

    try {
      setIsMatching(true)
      setError("")
      setPipelineErrorStep(null)
      setNotice("Matching candidates...")
      const response = await fetch(authUrl("/api/match-candidates"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: job.id,
          batchId: batchId || undefined,
          candidateIds,
          uploadFileNames,
          matchScope: getMatchScope(includeAll),
          includeAllCandidates: includeAll,
        }),
      })
      const payload = await readJsonResponse(response)
      const rankedMatches = filterMatchesToCandidateScope(
        payload.data?.matches ?? [],
        includeAll || batchId ? [] : candidateIds
      )
      setMatches(rankedMatches)
      setSelectedCandidateIds(getDefaultSelectedCandidateIds(rankedMatches))
      setFlowStep("MATCHED")
      setNotice("Matching complete. Review top candidates below.")

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          resultsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
        })
      }

      return true
    } catch (matchError) {
      setPipelineErrorStep("match")
      setError(matchError instanceof Error ? matchError.message : "Candidate matching failed")
      return false
    } finally {
      setIsMatching(false)
    }
  }

  async function handleMatchCandidates() {
    if (!activeJob) {
      setError("Process a job description before matching candidates.")
      return
    }

    await runMatching(activeJob)
  }

  async function handleSendInterviews(
    mode: "STRONG_FIT" | "TOP_N" | "SELECTED",
    candidateIds?: string[],
    candidates?: CandidateInterviewSchedule[]
  ) {
    if (!activeJob) {
      setError("Choose a processed job before sending interviews.")
      return
    }

    if (flowStep !== "MATCHED") {
      setError("Run matching before sending interviews.")
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
          candidates,
          batchId: currentBatchId || undefined,
          matchScope: getMatchScope(includeAllCandidates),
          includeAllCandidates,
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

  function toggleCandidateSelection(candidateId: string, selected: boolean) {
    setSelectedCandidateIds((current) => {
      if (selected) {
        return current.includes(candidateId) ? current : [...current, candidateId]
      }

      return current.filter((id) => id !== candidateId)
    })
  }

  function toggleCompareCandidate(candidateId: string, selected: boolean) {
    if (selected && !compareCandidateIds.includes(candidateId) && compareCandidateIds.length >= 4) {
      setNotice("Compare up to 4 candidates at once.")
      return
    }

    setCompareCandidateIds((current) => {
      if (!selected) {
        return current.filter((id) => id !== candidateId)
      }

      if (current.includes(candidateId)) {
        return current
      }

      return [...current, candidateId]
    })
  }

  function selectRecommendedCandidates() {
    setSelectedCandidateIds(getDefaultSelectedCandidateIds(matches))
  }

  function openTopCandidateSendConfirmation() {
    const topCandidateIds = [...matches]
      .filter((match) => match.riskLevel !== "HIGH")
      .sort((left, right) => right.matchScore - left.matchScore)
      .slice(0, topN)
      .map((match) => match.candidateId)

    openSendConfirmation(topCandidateIds)
  }

  function resetSendScheduleState() {
    setSendAccessType("FLEXIBLE")
    setDefaultScheduleStartTime("")
    setDefaultScheduleEndTime("")
    setCustomScheduleEnabled(false)
    setCustomScheduleExpanded(false)
    setCandidateScheduleDrafts({})
    setSendScheduleError("")
  }

  function openSendConfirmation(candidateIds: string[]) {
    const uniqueCandidateIds = [...new Set(candidateIds)].filter(Boolean)

    if (uniqueCandidateIds.length === 0) {
      return
    }

    setPendingSendCandidateIds(uniqueCandidateIds)
    resetSendScheduleState()
    setConfirmSendOpen(true)
  }

  function closeSendConfirmation() {
    setConfirmSendOpen(false)
    setPendingSendCandidateIds([])
    resetSendScheduleState()
  }

  function getCandidateScheduleDraft(candidateId: string): CandidateScheduleDraft {
    return candidateScheduleDrafts[candidateId] ?? {
      startTime: defaultScheduleStartTime,
      endTime: defaultScheduleEndTime,
    }
  }

  function updateCandidateScheduleDraft(candidateId: string, patch: Partial<CandidateScheduleDraft>) {
    setCandidateScheduleDrafts((current) => ({
      ...current,
      [candidateId]: {
        startTime: current[candidateId]?.startTime ?? defaultScheduleStartTime,
        endTime: current[candidateId]?.endTime ?? defaultScheduleEndTime,
        ...patch,
      },
    }))
    setSendScheduleError("")
  }

  function validateScheduleWindow(startTime: string, endTime: string, label: string) {
    const start = getDateTimeValue(startTime)
    const end = getDateTimeValue(endTime)

    if (!start || !end) {
      return `${label} needs a valid start and end time.`
    }

    if (end <= start) {
      return `${label} end time must be after start time.`
    }

    return ""
  }

  function buildCandidateInterviewSchedules(): CandidateInterviewSchedule[] | null {
    if (sendAccessType === "FLEXIBLE") {
      return pendingSendMatches.map((match) => ({
        candidateId: match.candidateId,
        accessType: "FLEXIBLE",
        startTime: null,
        endTime: null,
      }))
    }

    const defaultScheduleError = validateScheduleWindow(defaultScheduleStartTime, defaultScheduleEndTime, "Default schedule")

    if (defaultScheduleError) {
      setSendScheduleError(defaultScheduleError)
      return null
    }

    const scheduledCandidates: CandidateInterviewSchedule[] = []

    for (const match of pendingSendMatches) {
      const draft = customScheduleEnabled
        ? getCandidateScheduleDraft(match.candidateId)
        : { startTime: defaultScheduleStartTime, endTime: defaultScheduleEndTime }
      const scheduleError = validateScheduleWindow(draft.startTime, draft.endTime, match.candidateName)

      if (scheduleError) {
        setSendScheduleError(scheduleError)
        return null
      }

      scheduledCandidates.push({
        candidateId: match.candidateId,
        accessType: "SCHEDULED",
        startTime: getDateTimeValue(draft.startTime)?.toISOString() ?? null,
        endTime: getDateTimeValue(draft.endTime)?.toISOString() ?? null,
      })
    }

    setSendScheduleError("")
    return scheduledCandidates
  }

  async function confirmPendingSend() {
    const candidateIds = pendingSendMatches.map((match) => match.candidateId)

    if (candidateIds.length === 0) {
      closeSendConfirmation()
      return
    }

    const candidates = buildCandidateInterviewSchedules()

    if (!candidates) {
      return
    }

    setConfirmSendOpen(false)
    setPendingSendCandidateIds([])
    await handleSendInterviews("SELECTED", candidateIds, candidates)
    resetSendScheduleState()
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

  function getCurrentUploadCandidateIds() {
    const rowCandidateIds = uploadRows
      .filter((row) => isResumeReady(row) && row.candidateId)
      .map((row) => row.candidateId as string)

    return [...new Set([...uploadedCandidateIds, ...rowCandidateIds])]
  }

  function openCleanupModal(nextModal: CleanupModal) {
    setCleanupMenuOpen(false)
    setDeleteConfirmationText("")
    setCleanupModal(nextModal)
  }

  async function handleClearResults() {
    if (!activeJob) {
      setError("Choose a processed job before clearing results.")
      return
    }

    const scopedCandidateIds = getCurrentUploadCandidateIds()
    const candidateIds = scopedCandidateIds.length > 0
      ? scopedCandidateIds
      : matches.map((match) => match.candidateId)

    try {
      setCleanupBusy(true)
      setError("")
      const response = await fetch(authUrl("/api/ai-screening/cleanup"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CLEAR_RESULTS",
          job_id: activeJob.id,
          batchId: currentBatchId || undefined,
          candidateIds,
        }),
      })
      await readJsonResponse(response)
      setMatches([])
      setSelectedCandidateIds([])
      setCompareCandidateIds([])
      setPendingSendCandidateIds([])
      setSendResults([])
      setConfirmSendOpen(false)
      setCompareModalOpen(false)
      setFlowStep("JD_PROCESSED")
      setPipelineErrorStep(null)
      setCleanupModal(null)
      setNotice("Analysis results cleared. Upload remains ready for matching.")
    } catch (cleanupError) {
      setError(cleanupError instanceof Error ? cleanupError.message : "Could not clear results")
    } finally {
      setCleanupBusy(false)
    }
  }

  async function handleDeleteUploadAndAnalysis() {
    const scopedCandidateIds = getCurrentUploadCandidateIds()
    const candidateIds = scopedCandidateIds.length > 0
      ? scopedCandidateIds
      : matches.map((match) => match.candidateId)

    try {
      setCleanupBusy(true)
      setError("")
      const response = await fetch(authUrl("/api/ai-screening/cleanup"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DELETE_UPLOAD",
          batchId: currentBatchId || undefined,
          candidateIds,
          confirmation: deleteConfirmationText,
        }),
      })
      const payload = await readJsonResponse(response)
      setFiles([])
      setUploadRows([])
      setCurrentBatchId("")
      setUploadedCandidateIds([])
      setMatches([])
      setSelectedCandidateIds([])
      setCompareCandidateIds([])
      setPendingSendCandidateIds([])
      setSendResults([])
      setConfirmSendOpen(false)
      setCompareModalOpen(false)
      setFlowStep("UPLOAD")
      setPipelineErrorStep(null)
      setCleanupModal(null)
      setDeleteConfirmationText("")
      setNotice(`Upload deleted. ${payload.data?.deletedCandidates ?? 0} candidate${payload.data?.deletedCandidates === 1 ? "" : "s"} removed.`)
    } catch (cleanupError) {
      setError(cleanupError instanceof Error ? cleanupError.message : "Could not delete upload")
    } finally {
      setCleanupBusy(false)
    }
  }

  function handleRetryPipeline() {
    if (pipelineErrorStep === "upload" || pipelineErrorStep === "parse") {
      void handleUpload()
      return
    }

    if (pipelineErrorStep === "job") {
      void processJobIntelligence({ runMatchAfter: AUTO_RUN })
      return
    }

    if (pipelineErrorStep === "match") {
      void handleMatchCandidates()
    }
  }

  return (
    <div className="min-h-screen bg-[#08111f] text-white">
      <Navbar onSendInterviewClick={() => setOpenSendInterview(true)} />

      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[28px] border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(8,17,31,0.98))] p-8 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
          <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-slate-500">VERIS Screening</p>
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

        <div className="mt-6">
          <StepProgress currentStep={flowStep} />
        </div>

        {(notice || error || isBusy) ? (
          <section className="mt-6 rounded-2xl border border-slate-800 bg-[#0f172a] px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className={`text-sm font-medium ${error ? "text-rose-200" : "text-slate-200"}`}>
                  {error || notice || "Processing"}
                </p>
                {isBusy ? (
                  <p className="mt-1 text-sm text-slate-400">{processingStatusText}</p>
                ) : null}
              </div>
              {isBusy ? (
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
                <p className="mt-1 text-sm text-slate-400">{files.length} selected, {uploadedResumeCount} ready</p>
              </div>
              <button
                type="button"
                onClick={handleUpload}
                disabled={isBusy}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UploadIcon />
                {uploading ? "Uploading..." : "Upload Resumes"}
              </button>
            </div>

            <label
              onDragEnter={(event) => {
                event.preventDefault()
                if (isBusy) {
                  return
                }
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
              <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple className="sr-only" onChange={handleFileChange} disabled={isBusy} />
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/80 text-cyan-200">
                <UploadIcon />
              </div>
              <p className="mt-4 text-base font-semibold text-white">Drop PDF/DOCX resumes</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">Files are stored in Supabase Storage, parsed, email-validated, and saved to the recruiter workspace.</p>
            </label>

            {currentBatchId ? (
              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/25 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">Current Upload</p>
                <p className="mt-2 text-sm font-semibold text-cyan-100">
                  {uploading
                    ? "Uploading resumes..."
                    : uploadedResumeCount > 0
                      ? `${uploadedResumeCount} resume${uploadedResumeCount === 1 ? "" : "s"} ready for matching`
                      : "Processing resumes..."}
                </p>
              </div>
            ) : null}

            {resumeDisplayRows.length > 0 ? (
              <div className="mt-5 max-h-72 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/25">
                {resumeDisplayRows.map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-4 border-b border-slate-800/80 px-4 py-3 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{row.name || row.fileName}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{row.email || row.error || "No Email ⚠️"}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getResumeStatusClass(row.status)}`}>
                      {getResumeStatusLabel(row.status)}
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
              <div className="text-right">
                <button
                  type="button"
                  onClick={handleProcessJob}
                  disabled={!canAnalyzeJob}
                  className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2.5 text-sm font-semibold text-blue-100 transition hover:border-blue-300/50 hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isProcessingJD ? "Analyzing..." : "Analyze Job"}
                </button>
                {!canAnalyzeJob && !isBusy ? (
                  <p className="mt-2 text-xs text-slate-500">{analyzeHelpText}</p>
                ) : null}
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="text-sm font-medium text-slate-300">Select Existing Job</label>
                <select
                  value={selectedExistingJobId}
                  onChange={(event) => {
                    const selectedJobId = event.target.value
                    const processedJob = screeningJobs.find((item) => item.id === selectedJobId) ?? null
                    setSelectedExistingJobId(selectedJobId)
                    setActiveJob(processedJob)
                    setRestoredActiveJobId(processedJob?.id ?? "")
                    setMatches([])
                    setSelectedCandidateIds([])
                    setCompareCandidateIds([])
                    setSendResults([])
                    setPipelineErrorStep(null)
                    if (hasUploadedResumes && processedJob) {
                      setFlowStep("JD_PROCESSED")
                    } else if (hasUploadedResumes) {
                      setFlowStep("JD_READY")
                    } else {
                      setFlowStep("UPLOAD")
                    }
                  }}
                  disabled={isBusy}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-400/60"
                >
                  <option value="">Select a job</option>
                  {existingJobs.map((job) => (
                    <option key={job.jobId} value={job.jobId}>{job.jobTitle}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setNewJobError("")
                    setCreateJobModalOpen(true)
                  }}
                  disabled={isBusy}
                  className="mt-3 rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-blue-400/40 hover:bg-blue-500/10 hover:text-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  + Create / Paste New Job Description
                </button>
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
                  <div className="flex flex-col items-end gap-2 text-right">
                    <div>
                      <button
                        type="button"
                        onClick={handleMatchCandidates}
                        disabled={!canRunMatching}
                        className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300/50 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isMatching ? "Matching..." : "Run Matching"}
                      </button>
                      {!canRunMatching && !isBusy ? (
                        <p className="mt-2 text-xs text-slate-500">{matchHelpText}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-5">
              <ProcessingTimeline
                steps={timelineSteps}
                errorLabel={timelineErrorLabel}
                onRetry={timelineErrorLabel ? handleRetryPipeline : undefined}
              />
            </div>
          </section>
        </div>

        <section ref={resultsSectionRef} className="mt-8 overflow-visible rounded-[28px] border border-slate-800 bg-[#0f172a] shadow-[0_16px_60px_rgba(2,6,23,0.3)]">
          <div className="border-b border-slate-800 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Screening Results</h2>
                <p className="mt-1 text-sm text-slate-400">{activeJob ? activeJob.title : "Process a JD to populate ranked candidates."}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium text-blue-100">{recommendedCount} candidates recommended for interview</span>
                  <span className="rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-100" title="VERIS recommended based on match score and risk analysis">
                    VERIS recommended based on match score and risk analysis
                  </span>
                </div>
              </div>
              {canShowCleanupActions ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setCleanupMenuOpen((current) => !current)}
                    disabled={isBusy}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950/50 text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Screening results actions"
                    aria-expanded={cleanupMenuOpen}
                  >
                    <MoreIcon />
                  </button>
                  {cleanupMenuOpen ? (
                    <div className="absolute right-0 top-12 z-30 w-60 overflow-hidden rounded-xl border border-slate-700 bg-[#0B1220] p-1 shadow-2xl">
                      <button
                        type="button"
                        onClick={() => openCleanupModal("CLEAR_RESULTS")}
                        disabled={matches.length === 0 || !activeJob}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Clear Results
                      </button>
                      <button
                        type="button"
                        onClick={() => openCleanupModal("DELETE_UPLOAD")}
                        disabled={!currentBatchId && getCurrentUploadCandidateIds().length === 0}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-200 transition hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Delete Upload & Analysis
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Total Candidates</p>
                <p className="mt-2 text-2xl font-semibold text-white">{decisionSummary.totalCandidates}</p>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-200/70">Strong Matches</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-100">{decisionSummary.strongMatches}</p>
              </div>
              <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-blue-200/70">Borderline</p>
                <p className="mt-2 text-2xl font-semibold text-blue-100">{decisionSummary.borderlineCandidates}</p>
              </div>
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-rose-200/70">Rejected</p>
                <p className="mt-2 text-2xl font-semibold text-rose-100">{decisionSummary.rejectedCandidates}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.07] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-100">Top Matches</h3>
                    <p className="mt-1 text-xs text-emerald-100/60">Score 80+ with low risk</p>
                  </div>
                  <span className="rounded-full border border-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                    {decisionSummary.topMatches.length}
                  </span>
                </div>
                {decisionSummary.topMatches.length > 0 ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {decisionSummary.topMatches.slice(0, 4).map((match) => (
                      <div key={match.id} className="rounded-xl border border-emerald-400/15 bg-slate-950/35 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{match.candidateName}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">{match.email || "No email captured"}</p>
                          </div>
                          <span className="text-lg font-semibold text-emerald-200">{match.matchScore}%</span>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-emerald-50/80">{getCandidateVerdict(match)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3">
                    <p className="text-sm font-medium text-amber-100">No strong matches yet</p>
                    <p className="mt-2 text-xs leading-5 text-amber-100/75">
                      {decisionSummary.commonGaps.length > 0
                        ? `Likely gaps: ${decisionSummary.commonGaps.join(", ")}.`
                        : "The current resumes may be below the score or risk threshold."}
                    </p>
                    <p className="mt-2 text-xs leading-5 text-amber-100/75">
                      Try adjusting filters, uploading more resumes, or switching to Search All Candidates.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
                <h3 className="text-sm font-semibold text-blue-100">Suggested Actions</h3>
                <div className="mt-4 space-y-3 text-sm leading-6 text-blue-50/85">
                  <p>Send interview to {decisionSummary.strongMatches} candidate{decisionSummary.strongMatches === 1 ? "" : "s"}.</p>
                  <p>Review {decisionSummary.reviewCandidates} candidate{decisionSummary.reviewCandidates === 1 ? "" : "s"} before deciding.</p>
                  {decisionSummary.rejectedCandidates > 0 ? (
                    <p>Deprioritize {decisionSummary.rejectedCandidates} weak or high-risk profile{decisionSummary.rejectedCandidates === 1 ? "" : "s"}.</p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-5 mb-4 grid w-full grid-cols-[minmax(145px,1.05fr)_minmax(125px,0.85fr)_minmax(105px,0.7fr)_minmax(205px,1.35fr)_minmax(145px,0.95fr)_minmax(205px,1.1fr)] items-center gap-2">
              <div className="contents">
                <select value={recommendationFilter} onChange={(event) => setRecommendationFilter(event.target.value as (typeof recommendationFilters)[number])} disabled={isBusy} className="h-10 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/50 px-2.5 py-2 text-[12px] text-white outline-none">
                  {recommendationFilters.map((filter) => <option key={filter} value={filter} className="bg-slate-950 text-white">{getRecommendationLabel(filter)}</option>)}
                </select>
                <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value as (typeof riskFilters)[number])} disabled={isBusy} className="h-10 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/50 px-2.5 py-2 text-[12px] text-white outline-none">
                  {riskFilters.map((filter) => <option key={filter} value={filter} className="bg-slate-950 text-white">{filter === "ALL" ? "All Risk Levels" : filter}</option>)}
                </select>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as "score" | "recent")} disabled={isBusy} className="h-10 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/50 px-2.5 py-2 text-[12px] text-white outline-none">
                  <option value="score" className="bg-slate-950 text-white">Top Score</option>
                  <option value="recent" className="bg-slate-950 text-white">Most Recent</option>
                </select>
                <select
                  value={includeAllCandidates ? "GLOBAL" : "BATCH"}
                  onChange={(event) => setIncludeAllCandidates(event.target.value === "GLOBAL")}
                  disabled={isBusy}
                  aria-label="Scope"
                  title="Choose whether to match only uploaded resumes or include your full candidate database"
                  className="h-10 w-full min-w-0 rounded-xl border border-slate-700 bg-slate-950/50 px-2.5 py-2 text-[12px] text-white outline-none"
                >
                  <option value="BATCH" className="bg-slate-950 text-white">Scope: Uploaded Resumes Only</option>
                  <option value="GLOBAL" className="bg-slate-950 text-white">Scope: All Candidates (Database)</option>
                </select>
              </div>

              <div className="contents">
                <button
                  type="button"
                  onClick={selectRecommendedCandidates}
                  disabled={isBusy || flowStep !== "MATCHED" || !activeJob || matches.length === 0}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-cyan-400/30 bg-transparent px-2 py-2 text-[12px] font-semibold text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Select Recommended
                </button>
                <div className="flex h-10 w-full min-w-0 items-center overflow-hidden rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-[12px] text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.08)]">
                  <span className="flex h-full shrink-0 items-center border-r border-cyan-400/20 px-2.5 font-semibold">Send Top</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={topN}
                    onChange={(event) => setTopN(Number(event.target.value))}
                    disabled={isBusy}
                    aria-label="Number of top candidates to send"
                    className="h-full w-10 shrink-0 bg-transparent px-1.5 text-[12px] font-semibold text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={openTopCandidateSendConfirmation}
                    disabled={isBusy || flowStep !== "MATCHED" || !activeJob || matches.length === 0}
                    className="h-full min-w-0 flex-1 border-l border-cyan-400/20 px-2 text-[12px] font-semibold text-cyan-50 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Candidates
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              {comparisonMatches.length >= 2 ? (
                <button
                  type="button"
                  onClick={() => setCompareModalOpen(true)}
                  className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:border-blue-300/50 hover:bg-blue-500/15"
                >
                  Compare Candidates
                </button>
              ) : null}
            </div>
          </div>

          <div className="w-full">
            <table className="w-full table-fixed text-[13px] leading-[1.4]">
              <colgroup>
                <col className="w-[6%]" />
                <col className="w-[6%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[25%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="bg-slate-950/20 text-slate-400">
                <tr>
                  <th className="px-3 py-2.5 text-center text-[12px] font-medium leading-[1.4]">Compare</th>
                  <th className="px-3 py-2.5 text-center text-[12px] font-medium leading-[1.4]">Selected</th>
                  <th className="px-3 py-2.5 text-left text-[12px] font-medium leading-[1.4]">Candidate Name</th>
                  <th className="px-3 py-2.5 text-left text-[12px] font-medium leading-[1.4]">Email</th>
                  <th className="px-3 py-2.5 text-left text-[12px] font-medium leading-[1.4]">Match Score</th>
                  <th className="px-3 py-2.5 text-left text-[12px] font-medium leading-[1.4]">Risk Level</th>
                  <th className="px-3 py-2.5 text-left text-[12px] font-medium leading-[1.4]">Recommendation</th>
                  <th className="px-3 py-2.5 text-left text-[12px] font-medium leading-[1.4]">Decision Insights</th>
                  <th className="px-3 py-2.5 text-right text-[12px] font-medium leading-[1.4]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMatches.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-slate-400">
                      {isMatching ? (
                        "Matching candidates..."
                      ) : (
                        <div>
                          <p className="font-medium text-slate-300">No matching candidates found</p>
                          <p className="mt-2 text-sm text-slate-500">Try adjusting filters or uploading more resumes</p>
                          <div className="mx-auto mt-4 max-w-xl rounded-2xl border border-slate-800 bg-slate-950/35 p-4 text-left">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Possible reasons</p>
                            <ul className="mt-3 space-y-2 text-sm text-slate-400">
                              <li>Required skills are missing from the uploaded resumes.</li>
                              <li>Experience alignment may be below the selected role threshold.</li>
                              <li>Current filters may be hiding medium-fit candidates.</li>
                            </ul>
                            <p className="mt-3 text-sm text-slate-400">Suggestions: adjust filters, upload more resumes, or switch to Search All Candidates.</p>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredMatches.map((match) => {
                    const isRecommended = isAiRecommendedForInterview(match)
                    const isSelected = selectedCandidateIdSet.has(match.candidateId)
                    const isCompared = compareCandidateIdSet.has(match.candidateId)
                    const compareLimitReached = compareCandidateIds.length >= 4 && !isCompared
                    const isHighRisk = match.riskLevel === "HIGH"
                    const confidenceLevel = getConfidenceLevel(match)
                    const strengths = getCandidateStrengths(match)
                    const gaps = getCandidateWeaknesses(match)
                    const verdict = getCandidateVerdict(match)
                    const insightTooltipText = [
                      `Strengths: ${strengths.join("; ")}`,
                      `Gaps: ${gaps.join("; ")}`,
                      `Verdict: ${verdict}`,
                      match.insights?.short_reasoning ? `Reasoning: ${match.insights.short_reasoning}` : "",
                    ].filter(Boolean).join("\n")

                    return (
                    <tr key={match.id} className="border-t border-slate-800/80 align-middle text-slate-200">
                      <td className="px-3 py-2.5 align-middle">
                        <label className="flex items-center justify-center text-xs text-slate-400">
                          <input
                            type="checkbox"
                            checked={isCompared}
                            onChange={(event) => toggleCompareCandidate(match.candidateId, event.target.checked)}
                            disabled={isBusy || flowStep !== "MATCHED" || compareLimitReached}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-950 accent-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Compare ${match.candidateName}`}
                          />
                        </label>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <div className="flex items-center justify-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) => toggleCandidateSelection(match.candidateId, event.target.checked)}
                            disabled={isBusy || flowStep !== "MATCHED"}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-950 accent-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Select ${match.candidateName} for interview`}
                          />
                          <div className="flex min-w-0 items-center gap-1">
                            {isRecommended ? (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-blue-400/20 bg-blue-500/10 text-[9px] font-semibold text-blue-100" title="VERIS recommended based on match score and risk analysis" aria-label="VERIS recommended">
                                V
                              </span>
                            ) : null}
                            {isHighRisk ? (
                              <span className="group relative inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-400/30 bg-amber-500/10 text-xs font-bold text-amber-200" aria-label="High risk warning">
                                !
                                <span className="absolute left-0 top-full z-50 mt-2 hidden w-64 rounded-lg border border-white/10 bg-[#0B1220] p-3 text-left text-xs font-normal leading-5 text-gray-200 shadow-xl group-hover:block">
                                  High risk candidate. Review carefully before sending.
                                </span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 align-middle font-medium text-white">
                        <span className="block leading-[1.4]">{match.candidateName}</span>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        {editingCandidateId === match.candidateId ? (
                          <div className="flex min-w-0 gap-2">
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
                          <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-slate-200" title={match.email}>{match.email}</span>
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
                      <td className="px-3 py-2.5 align-middle">
                        <span className={`font-semibold leading-[1.4] ${getScoreColor(match.matchScore)}`}>
                          {match.matchScore}%{" \u2022 "}<span className={getConfidenceTone(confidenceLevel)}>{getConfidenceLabel(confidenceLevel)}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[12px] font-medium uppercase tracking-[0.08em] ${getRiskTone(match.riskLevel)}`}>
                          {match.riskLevel}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <span className={`text-[13px] font-semibold leading-[1.4] ${getRecommendationTextTone(match.recommendation)}`}>
                          {getRecommendationDisplayLabel(match.recommendation)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 align-middle text-slate-400">
                        <InsightTooltip
                          text={insightTooltipText}
                          showHint={false}
                          preview={(
                            <div className="space-y-1 text-[12px] leading-[1.4]">
                              <p className="overflow-hidden text-ellipsis whitespace-nowrap text-slate-300">
                                <span className="font-semibold text-emerald-300/80">Strengths:</span> {strengths[0]}
                              </p>
                              <p className="overflow-hidden text-ellipsis whitespace-nowrap text-slate-300">
                                <span className="font-semibold text-amber-300/80">Gaps:</span> {gaps[0]}
                              </p>
                            </div>
                          )}
                        />
                      </td>
                      <td className="px-3 py-2.5 align-middle text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCandidateId(match.candidateId)
                              setEmailDraft(match.email ?? "")
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900/80 text-slate-300 transition hover:border-blue-400/40 hover:bg-blue-500/10 hover:text-blue-100"
                            aria-label={`Edit email for ${match.candidateName}`}
                          >
                            <EditIcon />
                          </button>
                          <button
                            type="button"
                            onClick={() => openSendConfirmation([match.candidateId])}
                            disabled={isBusy || flowStep !== "MATCHED" || !match.email}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-cyan-100 transition hover:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Send interview to ${match.candidateName}`}
                          >
                            <SendIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {matches.length > 0 ? (
          <div className="sticky bottom-4 z-40 mt-6 rounded-2xl border border-cyan-400/20 bg-[#0B1220]/95 p-4 shadow-[0_18px_70px_rgba(2,6,23,0.55)] backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Send Interview to Selected ({selectedCount})</p>
                <p className="mt-1 text-xs text-slate-400">
                  Human approval is required before HireVeri sends interview links.
                  {selectedMissingEmailCount > 0 ? ` ${selectedMissingEmailCount} selected candidate${selectedMissingEmailCount === 1 ? "" : "s"} without email will be skipped.` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openSendConfirmation(selectedMatches.map((match) => match.candidateId))}
                disabled={isBusy || flowStep !== "MATCHED" || selectedCount === 0}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-2.5 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SendIcon />
                Send Interview
              </button>
            </div>
          </div>
        ) : null}

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

      {createJobModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="create-job-title">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-[#0B1220] p-6 shadow-[0_24px_90px_rgba(2,6,23,0.7)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="create-job-title" className="text-lg font-semibold text-white">Create Job Description</h2>
                <p className="mt-2 text-sm text-slate-400">Paste a JD once, save it as a job, then select it for screening.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!savingNewJob) {
                    setCreateJobModalOpen(false)
                    setNewJobError("")
                  }
                }}
                disabled={savingNewJob}
                className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close create job modal"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="text-sm font-medium text-slate-300">Job Title <span className="text-slate-600">(optional)</span></label>
                <input
                  value={newJobTitle}
                  onChange={(event) => setNewJobTitle(event.target.value)}
                  disabled={savingNewJob}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/60 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Senior Backend Engineer"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Job Description</label>
                <textarea
                  value={newJobDescription}
                  onChange={(event) => setNewJobDescription(event.target.value)}
                  disabled={savingNewJob}
                  rows={10}
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-700 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/60 disabled:cursor-not-allowed disabled:opacity-60"
                  placeholder="Paste the full job description here"
                />
              </div>
            </div>

            {newJobError ? (
              <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{newJobError}</p>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCreateJobModalOpen(false)
                  setNewJobError("")
                }}
                disabled={savingNewJob}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreatePastedJob}
                disabled={savingNewJob || !newJobDescription.trim()}
                className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:border-blue-300/50 hover:bg-blue-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingNewJob ? "Saving..." : "Save Job"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cleanupModal === "CLEAR_RESULTS" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="clear-results-title">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#0B1220] p-6 shadow-[0_24px_90px_rgba(2,6,23,0.7)]">
            <h2 id="clear-results-title" className="text-lg font-semibold text-white">Clear current analysis results?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Match scores, recommendations, selections, and comparison state will be removed for this upload. The uploaded resumes stay available so you can run matching again.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCleanupModal(null)}
                disabled={cleanupBusy}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearResults}
                disabled={cleanupBusy}
                className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:border-blue-300/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cleanupBusy ? "Clearing..." : "Clear Results"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cleanupModal === "DELETE_UPLOAD" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-upload-title">
          <div className="w-full max-w-md rounded-2xl border border-rose-400/25 bg-[#0B1220] p-6 shadow-[0_24px_90px_rgba(2,6,23,0.7)]">
            <h2 id="delete-upload-title" className="text-lg font-semibold text-white">Delete upload and analysis?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              This removes uploaded candidate records, saved analysis results, selections, and resume files for the current upload. This action cannot be undone.
            </p>
            <label className="mt-5 block text-sm font-medium text-slate-300">
              Type DELETE to confirm
              <input
                value={deleteConfirmationText}
                onChange={(event) => setDeleteConfirmationText(event.target.value)}
                disabled={cleanupBusy}
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none transition focus:border-rose-400/60 disabled:cursor-not-allowed disabled:opacity-60"
                autoComplete="off"
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setCleanupModal(null)
                  setDeleteConfirmationText("")
                }}
                disabled={cleanupBusy}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteUploadAndAnalysis}
                disabled={cleanupBusy || deleteConfirmationText !== "DELETE"}
                className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-300/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cleanupBusy ? "Deleting..." : "Delete Upload"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmSendOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-send-title">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-[#0B1220] p-6 shadow-[0_24px_90px_rgba(2,6,23,0.7)]">
            <h2 id="confirm-send-title" className="text-lg font-semibold text-white">
              Confirm Interview Send
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              You are about to send interviews to {pendingSendMatches.length} candidate{pendingSendMatches.length === 1 ? "" : "s"}.
            </p>
            {pendingSendMissingEmailCount > 0 ? (
              <p className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                {pendingSendMissingEmailCount} selected candidate{pendingSendMissingEmailCount === 1 ? "" : "s"} without email will be skipped.
              </p>
            ) : null}

            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/35 p-4">
              <p className="text-sm font-semibold text-white">Interview Access</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${sendAccessType === "FLEXIBLE" ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100" : "border-slate-700 text-slate-300 hover:border-slate-500"}`}>
                  <input
                    type="radio"
                    value="FLEXIBLE"
                    checked={sendAccessType === "FLEXIBLE"}
                    onChange={() => {
                      setSendAccessType("FLEXIBLE")
                      setSendScheduleError("")
                    }}
                    className="h-4 w-4 accent-cyan-400"
                  />
                  Flexible access
                </label>
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${sendAccessType === "SCHEDULED" ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-100" : "border-slate-700 text-slate-300 hover:border-slate-500"}`}>
                  <input
                    type="radio"
                    value="SCHEDULED"
                    checked={sendAccessType === "SCHEDULED"}
                    onChange={() => {
                      setSendAccessType("SCHEDULED")
                      setSendScheduleError("")
                    }}
                    className="h-4 w-4 accent-cyan-400"
                  />
                  Fixed Schedule
                </label>
              </div>

              {sendAccessType === "SCHEDULED" ? (
                <div className="mt-4 rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06] p-4">
                  <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-cyan-200/75">
                    <CalendarIcon />
                    <span>Default Schedule</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <DateTimeField label="Start Time" value={defaultScheduleStartTime} onChange={(value) => {
                      setDefaultScheduleStartTime(value)
                      setSendScheduleError("")
                    }} />
                    <DateTimeField label="End Time" value={defaultScheduleEndTime} onChange={(value) => {
                      setDefaultScheduleEndTime(value)
                      setSendScheduleError("")
                    }} />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-400">This schedule applies to all candidates unless you enable custom schedules.</p>

                  <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/45 px-3 py-2 text-sm text-slate-200 transition hover:border-cyan-400/30">
                    <input
                      type="checkbox"
                      checked={customScheduleEnabled}
                      onChange={(event) => {
                        const enabled = event.target.checked
                        setCustomScheduleEnabled(enabled)
                        setCustomScheduleExpanded(enabled && pendingSendMatches.length <= 10)
                        setCandidateScheduleDrafts({})
                        setSendScheduleError("")
                      }}
                      className="h-4 w-4 accent-cyan-400"
                    />
                    Set custom schedule per candidate
                  </label>

                  {customScheduleEnabled ? (
                    shouldCollapseCustomSchedule ? (
                      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-950/45 p-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-slate-300">Custom schedule enabled for {pendingSendMatches.length} candidates.</p>
                        <button
                          type="button"
                          onClick={() => setCustomScheduleExpanded(true)}
                          className="rounded-xl border border-cyan-400/30 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/50 hover:bg-cyan-400/10"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Candidate Schedules</p>
                          {pendingSendMatches.length > 10 ? (
                            <button
                              type="button"
                              onClick={() => setCustomScheduleExpanded(false)}
                              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
                            >
                              Collapse
                            </button>
                          ) : null}
                        </div>
                        <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                          {pendingSendMatches.map((match) => {
                            const draft = getCandidateScheduleDraft(match.candidateId)

                            return (
                              <div key={match.candidateId} className="rounded-xl border border-slate-800 bg-slate-950/45 p-3">
                                <div className="mb-3 min-w-0">
                                  <p className="truncate text-sm font-semibold text-white">{match.candidateName}</p>
                                  <p className="truncate text-xs text-slate-500">{match.email || "No email"}</p>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <DateTimeField label="Start Time" value={draft.startTime} onChange={(value) => updateCandidateScheduleDraft(match.candidateId, { startTime: value })} />
                                  <DateTimeField label="End Time" value={draft.endTime} onChange={(value) => updateCandidateScheduleDraft(match.candidateId, { endTime: value })} />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  ) : null}
                </div>
              ) : null}
            </div>

            {sendScheduleError ? (
              <p className="mt-3 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{sendScheduleError}</p>
            ) : null}

            <div className="mt-5 max-h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/35">
              {pendingSendMatches.map((match) => (
                <div key={match.candidateId} className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2 last:border-b-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">{match.candidateName}</p>
                    <p className="truncate text-xs text-slate-500">{match.email || "No email"}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase ${getRiskTone(match.riskLevel)}`}>
                    {match.riskLevel}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeSendConfirmation}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPendingSend}
                disabled={isBusy || pendingSendMatches.length === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-300/50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SendIcon />
                Send Interview
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {compareModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="compare-candidates-title">
          <div className="flex max-h-[88vh] w-full max-w-6xl flex-col rounded-2xl border border-slate-800 bg-[#0B1220] p-6 shadow-[0_24px_90px_rgba(2,6,23,0.7)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="compare-candidates-title" className="text-lg font-semibold text-white">Compare Candidates</h2>
                <p className="mt-2 text-sm text-slate-400">Side-by-side view for up to 4 candidates.</p>
              </div>
              <button
                type="button"
                onClick={() => setCompareModalOpen(false)}
                className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Close
              </button>
            </div>

            {comparisonInsight ? (
              <div className="mt-5 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-200/70">AI Insight</p>
                <p className="mt-2 text-sm leading-6 text-blue-50">{comparisonInsight}</p>
              </div>
            ) : null}

            <div className="mt-5 overflow-auto rounded-2xl border border-slate-800">
              <table className="w-full min-w-[900px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[180px]" />
                  {comparisonMatches.map((match) => (
                    <col key={match.candidateId} className="w-[260px]" />
                  ))}
                </colgroup>
                <tbody className="divide-y divide-slate-800">
                  <tr>
                    <th className="bg-slate-950/35 p-4 text-left font-medium text-slate-400">Name</th>
                    {comparisonMatches.map((match) => (
                      <td key={match.candidateId} className="p-4 align-top font-semibold text-white">{match.candidateName}</td>
                    ))}
                  </tr>
                  <tr>
                    <th className="bg-slate-950/35 p-4 text-left font-medium text-slate-400">Match Score</th>
                    {comparisonMatches.map((match) => (
                      <td key={match.candidateId} className={`p-4 align-top text-xl font-semibold ${getScoreColor(match.matchScore)}`}>{match.matchScore}%</td>
                    ))}
                  </tr>
                  <tr>
                    <th className="bg-slate-950/35 p-4 text-left font-medium text-slate-400">Risk Level</th>
                    {comparisonMatches.map((match) => (
                      <td key={match.candidateId} className="p-4 align-top">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getRiskTone(match.riskLevel)}`}>
                          {match.riskLevel}
                        </span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th className="bg-slate-950/35 p-4 text-left font-medium text-slate-400">Strengths</th>
                    {comparisonMatches.map((match) => (
                      <td key={match.candidateId} className="p-4 align-top">
                        <ul className="space-y-2 text-sm leading-6 text-slate-300">
                          {getCandidateStrengths(match).map((strength) => (
                            <li key={strength}>{strength}</li>
                          ))}
                        </ul>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th className="bg-slate-950/35 p-4 text-left font-medium text-slate-400">Weaknesses</th>
                    {comparisonMatches.map((match) => (
                      <td key={match.candidateId} className="p-4 align-top">
                        <ul className="space-y-2 text-sm leading-6 text-slate-300">
                          {getCandidateWeaknesses(match).map((weakness) => (
                            <li key={weakness}>{weakness}</li>
                          ))}
                        </ul>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th className="bg-slate-950/35 p-4 text-left font-medium text-slate-400">Recommendation</th>
                    {comparisonMatches.map((match) => (
                      <td key={match.candidateId} className="p-4 align-top">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getRecommendationTone(match.recommendation)}`}>
                          {getRecommendationLabel(match.recommendation)}
                        </span>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <SendInterviewModal isOpen={openSendInterview} onClose={() => setOpenSendInterview(false)} />
    </div>
  )
}
