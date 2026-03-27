import type { z } from "zod"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"
import { ApiError } from "@/lib/server/errors"
import { createJobSchema } from "@/lib/server/validators"

type CreateJobInput = z.infer<typeof createJobSchema>

type CreatedJobRow = {
  job_id: string
}

export async function createJob(input: CreateJobInput) {
  const experienceLevel = await prisma.experienceLevelPool.findUnique({
    where: { experienceLevelId: input.experience_level_id },
    select: { experienceLevelId: true },
  })

  if (!experienceLevel) {
    throw new ApiError(400, "INVALID_EXPERIENCE_LEVEL", "experience_level_id does not exist")
  }

  const job = await prisma.$transaction(async (tx) => {
    const createdJobs = await tx.$queryRaw<CreatedJobRow[]>(Prisma.sql`
      insert into public.job_positions (
        organization_id,
        job_title,
        job_description,
        experience_level_id,
        core_skills,
        difficulty_profile
      )
      values (
        ${input.organization_id}::uuid,
        ${input.job_title},
        ${input.job_description ?? null},
        ${input.experience_level_id}::smallint,
        ${input.core_skills}::text[],
        ${input.difficulty_profile}
      )
      returning job_id
    `)

    const createdJob = createdJobs[0]

    if (!createdJob) {
      throw new ApiError(500, "JOB_CREATE_FAILED", "Failed to create job")
    }

    if (input.skill_baseline.length > 0) {
      await tx.companySkillBaseline.createMany({
        data: input.skill_baseline.map((baseline) => ({
          organizationId: input.organization_id,
          jobId: createdJob.job_id,
          skillDomain: baseline.skill_domain,
          expectedLevel: baseline.expected_level,
        })),
      })
    }

    return createdJob
  })

  return { job_id: job.job_id }
}
