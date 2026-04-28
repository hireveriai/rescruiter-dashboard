import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"
import { ApiError } from "@/lib/server/errors"
import type { ParsedResume } from "@/lib/server/resumeParser"
import type { CandidateMatchResult, ParsedJobDescription } from "@/lib/server/ai-screening/openai"

const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i

export type ScreeningJob = {
  id: string
  title: string
  description: string
  requiredSkills: string[]
  experienceNeeded: number | null
  roleTitle: string | null
  extractedJson: ParsedJobDescription | Record<string, unknown>
  sourceJobPositionId: string | null
  createdAt: string
}

type ScreeningJobRow = {
  id: string
  title: string
  description: string
  required_skills: string[] | null
  experience_needed: string | number | null
  role_title: string | null
  extracted_json: ParsedJobDescription | Record<string, unknown> | null
  source_job_position_id: string | null
  created_at: Date | string
}

type CandidateRow = {
  candidate_id: string
  full_name: string
  email: string | null
  phone: string | null
  resume_url: string | null
  resume_text: string | null
  extracted_json: ParsedResume | Record<string, unknown> | null
  upload_batch_id: string | null
  created_at: Date | string
}

export type MatchResultRow = {
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
  insights: Record<string, unknown>
  createdAt: string
}

type MatchDbRow = {
  id: string
  candidate_id: string
  candidate_name: string
  email: string | null
  phone: string | null
  resume_url: string | null
  match_score: number
  skill_match: number
  experience_match: number
  risk_level: "LOW" | "MEDIUM" | "HIGH"
  recommendation: "STRONG_FIT" | "POTENTIAL" | "WEAK" | "REJECT"
  insights: Record<string, unknown> | null
  created_at: Date | string
}

type JobPositionRow = {
  job_id: string
  job_title: string
  job_description: string | null
  core_skills: string[] | null
  experience_level_id: number
}

type UploadBatchManifestRow = {
  batch_id: string
  candidate_ids: unknown
}

function toIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value
}

function normalizeUuidList(values: unknown) {
  if (!Array.isArray(values)) {
    return []
  }

  return values
    .map((value) => (typeof value === "string" ? normalizeUuid(value) : null))
    .filter((value): value is string => Boolean(value))
}

function normalizeJob(row: ScreeningJobRow): ScreeningJob {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    requiredSkills: row.required_skills ?? [],
    experienceNeeded:
      row.experience_needed === null || row.experience_needed === undefined
        ? null
        : Number(row.experience_needed),
    roleTitle: row.role_title,
    extractedJson: row.extracted_json ?? {},
    sourceJobPositionId: row.source_job_position_id,
    createdAt: toIso(row.created_at),
  }
}

function normalizeMatch(row: MatchDbRow): MatchResultRow {
  return {
    id: row.id,
    candidateId: row.candidate_id,
    candidateName: row.candidate_name,
    email: row.email,
    phone: row.phone,
    resumeUrl: row.resume_url,
    matchScore: row.match_score,
    skillMatch: row.skill_match,
    experienceMatch: row.experience_match,
    riskLevel: row.risk_level,
    recommendation: row.recommendation,
    insights: row.insights ?? {},
    createdAt: toIso(row.created_at),
  }
}

export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim().toLowerCase()
  return EMAIL_REGEX.test(trimmed) ? trimmed : null
}

export function getDisplayNameFromFile(fileName: string) {
  const withoutExtension = fileName.replace(/\.(pdf|docx)$/i, "")
  const normalized = withoutExtension.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
  return normalized || "Unnamed Candidate"
}

export async function saveParsedCandidate(input: {
  organizationId: string
  userId: string
  uploadBatchId: string
  fileName: string
  resumeUrl: string | null
  resumeText: string
  parsed: ParsedResume
  storage?: {
    bucket: string
    key: string
  }
}) {
  const email = normalizeEmail(input.parsed.email)
  const fullName = input.parsed.name?.trim() || getDisplayNameFromFile(input.fileName)
  const extractedJson = {
    ...input.parsed,
    email,
    sourceFileName: input.fileName,
    storage: input.storage ?? null,
    uploadBatchId: input.uploadBatchId,
    extractedAt: new Date().toISOString(),
  }

  if (email) {
    const existingRows = await prisma.$queryRaw<{ candidate_id: string }[]>(Prisma.sql`
      select candidate_id
      from public.candidates
      where organization_id = ${input.organizationId}::uuid
        and lower(email) = lower(${email})
      order by created_at desc
      limit 1
    `)
    const existing = existingRows[0]

    if (existing?.candidate_id) {
      const rows = await prisma.$queryRaw<{ candidate_id: string }[]>(Prisma.sql`
        update public.candidates
        set
          full_name = ${fullName},
          email = ${email},
          phone = ${input.parsed.phone ?? null},
          resume_url = ${input.resumeUrl},
          resume_text = ${input.resumeText},
          extracted_json = ${JSON.stringify(extractedJson)}::jsonb,
          upload_batch_id = ${input.uploadBatchId}::uuid,
          ai_screening_status = 'READY',
          created_by = coalesce(created_by, ${input.userId}::uuid)
        where candidate_id = ${existing.candidate_id}::uuid
          and organization_id = ${input.organizationId}::uuid
        returning candidate_id
      `)

      return {
        candidateId: rows[0]?.candidate_id ?? existing.candidate_id,
        created: false,
        email,
        name: fullName,
        extractedJson,
      }
    }
  }

  const rows = await prisma.$queryRaw<{ candidate_id: string }[]>(Prisma.sql`
    insert into public.candidates (
      organization_id,
      full_name,
      email,
      phone,
      resume_url,
      resume_text,
      extracted_json,
      upload_batch_id,
      ai_screening_status,
      created_by
    )
    values (
      ${input.organizationId}::uuid,
      ${fullName},
      ${email},
      ${input.parsed.phone ?? null},
      ${input.resumeUrl},
      ${input.resumeText},
      ${JSON.stringify(extractedJson)}::jsonb,
      ${input.uploadBatchId}::uuid,
      'READY',
      ${input.userId}::uuid
    )
    returning candidate_id
  `)

  const candidate = rows[0]

  if (!candidate?.candidate_id) {
    throw new ApiError(500, "CANDIDATE_SAVE_FAILED", "Failed to save parsed candidate")
  }

  return {
    candidateId: candidate.candidate_id,
    created: true,
    email,
    name: fullName,
    extractedJson,
  }
}

export async function getScreeningJobs(organizationId: string) {
  const rows = await prisma.$queryRaw<ScreeningJobRow[]>(Prisma.sql`
    select
      id::text,
      title,
      description,
      required_skills,
      experience_needed,
      role_title,
      extracted_json,
      source_job_position_id::text,
      created_at
    from public.jobs
    where organization_id = ${organizationId}::uuid
    order by created_at desc
    limit 100
  `)

  return rows.map(normalizeJob)
}

export async function recordUploadBatchManifest(input: {
  batchId: string
  organizationId: string
  userId: string
  candidateIds: string[]
  fileNames: string[]
}) {
  const batchId = normalizeUuid(input.batchId)

  if (!batchId) {
    return
  }

  const candidateIds = normalizeUuidList(input.candidateIds)

  try {
    await prisma.$queryRaw(Prisma.sql`
      insert into public.ai_screening_upload_batches (
        batch_id,
        organization_id,
        created_by,
        candidate_ids,
        file_names
      )
      values (
        ${batchId}::uuid,
        ${input.organizationId}::uuid,
        ${input.userId}::uuid,
        ${JSON.stringify(candidateIds)}::jsonb,
        ${JSON.stringify(input.fileNames)}::jsonb
      )
      on conflict (batch_id) do update
      set
        organization_id = excluded.organization_id,
        created_by = excluded.created_by,
        candidate_ids = excluded.candidate_ids,
        file_names = excluded.file_names
    `)
  } catch (error) {
    console.warn("AI screening upload batch manifest write skipped", error)
  }
}

export async function getUploadBatchManifest(input: {
  batchId: string
  organizationId: string
}) {
  const batchId = normalizeUuid(input.batchId)

  if (!batchId) {
    return null
  }

  let rows: UploadBatchManifestRow[]

  try {
    rows = await prisma.$queryRaw<UploadBatchManifestRow[]>(Prisma.sql`
      select
        batch_id::text,
        candidate_ids
      from public.ai_screening_upload_batches
      where batch_id = ${batchId}::uuid
        and organization_id = ${input.organizationId}::uuid
      limit 1
    `)
  } catch (error) {
    console.warn("AI screening upload batch manifest lookup skipped", error)
    return null
  }

  const manifest = rows[0]

  if (!manifest?.batch_id) {
    return null
  }

  return {
    batchId: manifest.batch_id,
    candidateIds: normalizeUuidList(manifest.candidate_ids),
  }
}

export async function getScreeningJob(organizationId: string, jobId: string) {
  const rows = await prisma.$queryRaw<ScreeningJobRow[]>(Prisma.sql`
    select
      id::text,
      title,
      description,
      required_skills,
      experience_needed,
      role_title,
      extracted_json,
      source_job_position_id::text,
      created_at
    from public.jobs
    where id = ${jobId}::uuid
      and organization_id = ${organizationId}::uuid
    limit 1
  `)

  return rows[0] ? normalizeJob(rows[0]) : null
}

export async function getJobPositionForScreening(organizationId: string, jobId: string) {
  const rows = await prisma.$queryRaw<JobPositionRow[]>(Prisma.sql`
    select
      job_id::text,
      job_title,
      job_description,
      core_skills,
      experience_level_id
    from public.job_positions
    where job_id = ${jobId}::uuid
      and organization_id = ${organizationId}::uuid
    limit 1
  `)

  return rows[0] ?? null
}

async function getExperienceLevelId(experienceNeeded: number | null) {
  const desired = experienceNeeded === null ? 2 : experienceNeeded <= 1.5 ? 1 : experienceNeeded >= 6 ? 3 : 2
  const rows = await prisma.$queryRaw<{ experience_level_id: number }[]>(Prisma.sql`
    select experience_level_id
    from public.experience_level_pool
    order by abs(experience_level_id - ${desired})
    limit 1
  `)

  return rows[0]?.experience_level_id ?? 1
}

function difficultyFromParsedJob(parsed: ParsedJobDescription) {
  if (parsed.seniority === "SENIOR") {
    return "SENIOR"
  }

  if (parsed.seniority === "JUNIOR") {
    return "JUNIOR"
  }

  return "MID"
}

export async function createJobPositionForPastedJd(input: {
  organizationId: string
  title: string
  description: string
  parsed: ParsedJobDescription
}) {
  const experienceLevelId = await getExperienceLevelId(input.parsed.experienceNeeded)
  const rows = await prisma.$queryRaw<{ job_id: string }[]>(Prisma.sql`
    insert into public.job_positions (
      organization_id,
      job_title,
      job_description,
      experience_level_id,
      core_skills,
      difficulty_profile,
      interview_duration_minutes
    )
    values (
      ${input.organizationId}::uuid,
      ${input.title},
      ${input.description},
      ${experienceLevelId}::smallint,
      ${input.parsed.requiredSkills}::text[],
      ${difficultyFromParsedJob(input.parsed)}::difficulty_profile,
      30
    )
    returning job_id::text
  `)

  const job = rows[0]

  if (!job?.job_id) {
    throw new ApiError(500, "JOB_POSITION_CREATE_FAILED", "Failed to create interview job for the pasted JD")
  }

  return job.job_id
}

export async function upsertScreeningJob(input: {
  id: string
  organizationId: string
  userId: string
  title: string
  description: string
  parsed: ParsedJobDescription
  sourceJobPositionId: string
}) {
  const rows = await prisma.$queryRaw<ScreeningJobRow[]>(Prisma.sql`
    insert into public.jobs (
      id,
      organization_id,
      title,
      description,
      required_skills,
      experience_needed,
      role_title,
      extracted_json,
      source_job_position_id,
      created_by
    )
    values (
      ${input.id}::uuid,
      ${input.organizationId}::uuid,
      ${input.title},
      ${input.description},
      ${input.parsed.requiredSkills}::text[],
      ${input.parsed.experienceNeeded},
      ${input.parsed.roleTitle},
      ${JSON.stringify(input.parsed)}::jsonb,
      ${input.sourceJobPositionId}::uuid,
      ${input.userId}::uuid
    )
    on conflict (id) do update
    set
      title = excluded.title,
      description = excluded.description,
      required_skills = excluded.required_skills,
      experience_needed = excluded.experience_needed,
      role_title = excluded.role_title,
      extracted_json = excluded.extracted_json,
      source_job_position_id = excluded.source_job_position_id
    returning
      id::text,
      title,
      description,
      required_skills,
      experience_needed,
      role_title,
      extracted_json,
      source_job_position_id::text,
      created_at
  `)

  const job = rows[0]

  if (!job?.id) {
    throw new ApiError(500, "SCREENING_JOB_SAVE_FAILED", "Failed to save screening job")
  }

  return normalizeJob(job)
}

function normalizeUuid(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed && UUID_REGEX.test(trimmed) ? trimmed : null
}

export async function getCandidatesForMatching(input: {
  organizationId: string
  candidateIds?: string[]
  uploadBatchId?: string | null
  includeAllCandidates?: boolean
}) {
  const batchId = normalizeUuid(input.uploadBatchId)
  const candidateIds = (input.candidateIds ?? []).map(normalizeUuid).filter((id): id is string => Boolean(id))
  const includeAllCandidates = input.includeAllCandidates === true
  const hasCandidateFilter = candidateIds.length > 0

  if (!includeAllCandidates && !batchId && !hasCandidateFilter) {
    return []
  }

  const rows = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
    select
      candidate_id::text,
      full_name,
      email,
      phone,
      resume_url,
      resume_text,
      extracted_json,
      upload_batch_id::text,
      created_at
    from public.candidates
    where organization_id = ${input.organizationId}::uuid
      and coalesce(ai_screening_status, 'READY') <> 'ARCHIVED'
      ${
        !includeAllCandidates && hasCandidateFilter && batchId
          ? Prisma.sql`and (candidate_id::text in (${Prisma.join(candidateIds)}) or upload_batch_id = ${batchId}::uuid or extracted_json->>'uploadBatchId' = ${batchId})`
          : !includeAllCandidates && hasCandidateFilter
            ? Prisma.sql`and candidate_id::text in (${Prisma.join(candidateIds)})`
            : !includeAllCandidates && batchId
              ? Prisma.sql`and (upload_batch_id = ${batchId}::uuid or extracted_json->>'uploadBatchId' = ${batchId})`
              : Prisma.empty
      }
    order by created_at desc
    limit 250
  `)

  return rows
}

export async function getRecentCandidatesForMatchingFallback(input: {
  organizationId: string
  userId: string
}) {
  const rows = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
    select
      candidate_id::text,
      full_name,
      email,
      phone,
      resume_url,
      resume_text,
      extracted_json,
      upload_batch_id::text,
      created_at
    from public.candidates
    where organization_id = ${input.organizationId}::uuid
      and (created_by = ${input.userId}::uuid or created_by is null)
      and coalesce(ai_screening_status, 'READY') <> 'ARCHIVED'
      and created_at > now() - interval '6 hours'
      and resume_text is not null
      and (
        upload_batch_id is not null
        or extracted_json ? 'uploadBatchId'
      )
    order by created_at desc
    limit 25
  `)

  return rows
}

export async function upsertCandidateJobMatch(input: {
  organizationId: string
  candidateId: string
  jobId: string
  result: CandidateMatchResult
}) {
  const insights = {
    missing_skills: input.result.missingSkills,
    short_reasoning: input.result.shortReasoning,
    evaluated_at: new Date().toISOString(),
  }
  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    insert into public.candidate_job_matches (
      organization_id,
      candidate_id,
      job_id,
      match_score,
      skill_match,
      experience_match,
      risk_level,
      recommendation,
      insights
    )
    values (
      ${input.organizationId}::uuid,
      ${input.candidateId}::uuid,
      ${input.jobId}::uuid,
      ${input.result.matchScore},
      ${input.result.skillMatch},
      ${input.result.experienceMatch},
      ${input.result.riskLevel},
      ${input.result.recommendation},
      ${JSON.stringify(insights)}::jsonb
    )
    on conflict (candidate_id, job_id) do update
    set
      match_score = excluded.match_score,
      skill_match = excluded.skill_match,
      experience_match = excluded.experience_match,
      risk_level = excluded.risk_level,
      recommendation = excluded.recommendation,
      insights = excluded.insights
    returning id::text
  `)

  return rows[0]?.id ?? null
}

export async function getMatchResults(
  organizationId: string,
  jobId: string,
  options?: {
    uploadBatchId?: string | null
    candidateIds?: string[]
    includeAllCandidates?: boolean
  }
) {
  const batchId = normalizeUuid(options?.uploadBatchId)
  const candidateIds = (options?.candidateIds ?? []).map(normalizeUuid).filter((id): id is string => Boolean(id))
  const hasCandidateFilter = candidateIds.length > 0
  const includeAllCandidates = options?.includeAllCandidates === true
  const rows = await prisma.$queryRaw<MatchDbRow[]>(Prisma.sql`
    select
      m.id::text,
      c.candidate_id::text,
      c.full_name as candidate_name,
      c.email,
      c.phone,
      c.resume_url,
      m.match_score,
      m.skill_match,
      m.experience_match,
      m.risk_level,
      m.recommendation,
      m.insights,
      m.created_at
    from public.candidate_job_matches m
    inner join public.candidates c
      on c.candidate_id = m.candidate_id
    inner join public.jobs j
      on j.id = m.job_id
    where m.organization_id = ${organizationId}::uuid
      and m.job_id = ${jobId}::uuid
      and j.organization_id = ${organizationId}::uuid
      ${
        !includeAllCandidates && hasCandidateFilter && batchId
          ? Prisma.sql`and (c.candidate_id::text in (${Prisma.join(candidateIds)}) or c.upload_batch_id = ${batchId}::uuid or c.extracted_json->>'uploadBatchId' = ${batchId})`
          : !includeAllCandidates && hasCandidateFilter
            ? Prisma.sql`and c.candidate_id::text in (${Prisma.join(candidateIds)})`
            : !includeAllCandidates && batchId
              ? Prisma.sql`and (c.upload_batch_id = ${batchId}::uuid or c.extracted_json->>'uploadBatchId' = ${batchId})`
              : Prisma.empty
      }
    order by m.match_score desc, m.created_at desc
  `)

  return rows.map(normalizeMatch)
}

export async function updateCandidateEmail(input: {
  organizationId: string
  candidateId: string
  email: string | null
}) {
  const rows = await prisma.$queryRaw<{ candidate_id: string; email: string | null }[]>(Prisma.sql`
    update public.candidates
    set email = ${input.email}
    where candidate_id = ${input.candidateId}::uuid
      and organization_id = ${input.organizationId}::uuid
    returning candidate_id::text, email
  `)

  const candidate = rows[0]

  if (!candidate?.candidate_id) {
    throw new ApiError(404, "CANDIDATE_NOT_FOUND", "Candidate not found")
  }

  return {
    candidateId: candidate.candidate_id,
    email: candidate.email,
  }
}

export async function getMatchesForInviteSelection(input: {
  organizationId: string
  jobId: string
  mode: "STRONG_FIT" | "TOP_N" | "SELECTED"
  topN?: number
  candidateIds?: string[]
  uploadBatchId?: string | null
  includeAllCandidates?: boolean
}) {
  const topN = Math.min(100, Math.max(1, input.topN ?? 10))
  const candidateIds = (input.candidateIds ?? []).map(normalizeUuid).filter((id): id is string => Boolean(id))
  const hasCandidateIds = candidateIds.length > 0
  const batchId = normalizeUuid(input.uploadBatchId)
  const includeAllCandidates = input.includeAllCandidates === true

  const rows = await prisma.$queryRaw<
    Array<{
      match_id: string
      candidate_id: string
      candidate_name: string
      email: string | null
      match_score: number
      recommendation: "STRONG_FIT" | "POTENTIAL" | "WEAK" | "REJECT"
    }>
  >(Prisma.sql`
    select
      m.id::text as match_id,
      c.candidate_id::text,
      c.full_name as candidate_name,
      c.email,
      m.match_score,
      m.recommendation
    from public.candidate_job_matches m
    inner join public.candidates c on c.candidate_id = m.candidate_id
    where m.organization_id = ${input.organizationId}::uuid
      and m.job_id = ${input.jobId}::uuid
      ${
        input.mode === "STRONG_FIT"
          ? Prisma.sql`and m.recommendation = 'STRONG_FIT'`
          : Prisma.empty
      }
      ${
        input.mode === "SELECTED" && hasCandidateIds
          ? Prisma.sql`and c.candidate_id::text in (${Prisma.join(candidateIds)})`
          : Prisma.empty
      }
      ${
        input.mode !== "SELECTED" && !includeAllCandidates && hasCandidateIds && batchId
          ? Prisma.sql`and (c.candidate_id::text in (${Prisma.join(candidateIds)}) or c.upload_batch_id = ${batchId}::uuid or c.extracted_json->>'uploadBatchId' = ${batchId})`
          : input.mode !== "SELECTED" && !includeAllCandidates && hasCandidateIds
            ? Prisma.sql`and c.candidate_id::text in (${Prisma.join(candidateIds)})`
            : input.mode !== "SELECTED" && !includeAllCandidates && batchId
              ? Prisma.sql`and (c.upload_batch_id = ${batchId}::uuid or c.extracted_json->>'uploadBatchId' = ${batchId})`
              : Prisma.empty
      }
    order by m.match_score desc, m.created_at desc
    ${input.mode === "TOP_N" ? Prisma.sql`limit ${topN}` : Prisma.empty}
  `)

  return rows
}

export async function recordInterviewInviteForScreening(input: {
  interviewId: string
  candidateId: string
  screeningJobId: string
  email: string
  inviteLink: string
  matchId: string | null
  emailStatus: "SENT" | "FAILED"
}) {
  const rows = await prisma.$queryRaw<{ invite_id: string }[]>(Prisma.sql`
    update public.interview_invites
    set
      candidate_id = ${input.candidateId}::uuid,
      job_id = ${input.screeningJobId}::uuid,
      email = ${input.email},
      invite_link = ${input.inviteLink},
      ai_screening_match_id = ${input.matchId}::uuid,
      ai_screening_email_status = ${input.emailStatus},
      ai_screening_sent_at = now()
    where interview_id = ${input.interviewId}::uuid
    returning invite_id::text
  `)

  return rows[0]?.invite_id ?? null
}
