import type { z } from "zod"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"
import { ApiError } from "@/lib/server/errors"
import { toFunctionApiError } from "@/lib/server/function-errors"
import { createJobSchema } from "@/lib/server/validators"

type CreateJobInput = z.infer<typeof createJobSchema>

type CreatedJobRow = {
  job_id: string
}

export async function createJob(input: CreateJobInput) {
  try {
    const rows = await prisma.$queryRaw<CreatedJobRow[]>(Prisma.sql`
      select *
      from public.fn_create_job(
        ${input.organization_id}::uuid,
        ${input.job_title},
        ${input.job_description ?? null},
        ${input.experience_level_id}::smallint,
        ${input.core_skills}::text[],
        ${input.difficulty_profile},
        ${JSON.stringify(input.skill_baseline)}::jsonb,
        ${input.coding_required},
        ${input.coding_assessment_type ?? null},
        ${input.coding_difficulty ?? null},
        ${input.coding_duration_minutes ?? null}::integer,
        ${input.coding_languages}::text[],
        ${input.interview_duration_minutes}::integer
      )
    `)

    const job = rows[0]

    if (!job?.job_id) {
      throw new ApiError(500, "JOB_CREATE_FAILED", "Failed to create job")
    }

    return { job_id: job.job_id }
  } catch (error) {
    throw toFunctionApiError(error, {
      statusCode: 500,
      code: "JOB_CREATE_FAILED",
      message: "Failed to create job",
    })
  }
}
