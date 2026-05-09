import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { prisma } from "@/lib/server/prisma"
import { errorResponse } from "@/lib/server/response"
import {
  jobPositionsSupportCodingConfig,
  jobPositionsSupportIsActive,
  jobPositionsSupportQuestionTypeDefault,
} from "@/lib/server/services/jobs"

type JobRow = {
  jobId: string
  jobTitle: string
  jobDescription: string | null
  experienceLevelId: number
  difficultyProfile: string
  interviewDurationMinutes: number | null
  questionTypeDefault: string | null
  coreSkills: string[] | null
  codingRequired: string | null
  codingAssessmentType: string | null
  codingDifficulty: string | null
  codingDurationMinutes: number | null
  codingLanguages: string[] | null
  isActive: boolean
  interviewCount: number
}

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const url = new URL(request.url)
    const includeInactive =
      url.searchParams.get("includeInactive") === "1" ||
      url.searchParams.get("include_inactive") === "1" ||
      url.searchParams.get("includeInactive") === "true" ||
      url.searchParams.get("include_inactive") === "true"
    const hasIsActive = await jobPositionsSupportIsActive()
    const hasCodingConfig = await jobPositionsSupportCodingConfig()
    const hasQuestionTypeDefault = await jobPositionsSupportQuestionTypeDefault()

    const rows = await prisma.$queryRaw<JobRow[]>(Prisma.sql`
      select
        jp.job_id as "jobId",
        jp.job_title as "jobTitle",
        jp.job_description as "jobDescription",
        jp.experience_level_id as "experienceLevelId",
        jp.difficulty_profile::text as "difficultyProfile",
        jp.interview_duration_minutes as "interviewDurationMinutes",
        ${hasQuestionTypeDefault ? Prisma.sql`jp.question_type_default::text` : Prisma.sql`'AUTO'`} as "questionTypeDefault",
        jp.core_skills as "coreSkills",
        ${hasCodingConfig ? Prisma.sql`jp.coding_required::text` : Prisma.sql`null`} as "codingRequired",
        ${hasCodingConfig ? Prisma.sql`jp.coding_assessment_type::text` : Prisma.sql`null`} as "codingAssessmentType",
        ${hasCodingConfig ? Prisma.sql`jp.coding_difficulty::text` : Prisma.sql`null`} as "codingDifficulty",
        ${hasCodingConfig ? Prisma.sql`jp.coding_duration_minutes` : Prisma.sql`null`} as "codingDurationMinutes",
        ${hasCodingConfig ? Prisma.sql`jp.coding_languages` : Prisma.sql`null`} as "codingLanguages",
        ${hasIsActive ? Prisma.sql`jp.is_active` : Prisma.sql`true`} as "isActive",
        count(i.interview_id)::int as "interviewCount"
      from public.job_positions jp
      left join public.interviews i
        on i.job_id = jp.job_id
      where jp.organization_id = ${auth.organizationId}::uuid
        ${hasIsActive && !includeInactive ? Prisma.sql`and jp.is_active = true` : Prisma.empty}
      group by
        jp.job_id,
        jp.job_title,
        jp.job_description,
        jp.experience_level_id,
        jp.difficulty_profile,
        jp.interview_duration_minutes,
        ${hasQuestionTypeDefault ? Prisma.sql`jp.question_type_default,` : Prisma.empty}
        jp.core_skills
        ${hasIsActive ? Prisma.sql`, jp.is_active` : Prisma.empty}
      order by jp.job_id desc
    `)

    return NextResponse.json({
      success: true,
      jobs: rows.map((row) => ({
        jobId: row.jobId,
        jobTitle: row.jobTitle,
        jobDescription: row.jobDescription,
        experienceLevelId: row.experienceLevelId,
        difficultyProfile: row.difficultyProfile,
        interviewDurationMinutes: row.interviewDurationMinutes,
        questionTypeDefault: row.questionTypeDefault ?? "AUTO",
        coreSkills: row.coreSkills ?? [],
        codingRequired: row.codingRequired,
        codingAssessmentType: row.codingAssessmentType,
        codingDifficulty: row.codingDifficulty,
        codingDurationMinutes: row.codingDurationMinutes,
        codingLanguages: row.codingLanguages ?? [],
        isActive: row.isActive,
        _count: {
          interviews: row.interviewCount ?? 0,
        },
      })),
      meta: {
        supportsJobActiveState: hasIsActive,
        supportsCodingConfig: hasCodingConfig,
        supportsQuestionTypeDefault: hasQuestionTypeDefault,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
