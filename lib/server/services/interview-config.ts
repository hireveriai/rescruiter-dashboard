import type { z } from "zod"

import { prisma } from "@/lib/server/prisma"
import { ApiError } from "@/lib/server/errors"
import { createInterviewConfigSchema } from "@/lib/server/validators"

type CreateInterviewConfigInput = z.infer<typeof createInterviewConfigSchema>

export async function createInterviewConfig(input: CreateInterviewConfigInput) {
  const [job, template] = await Promise.all([
    prisma.jobPosition.findUnique({
      where: { jobId: input.job_id },
      select: { jobId: true },
    }),
    prisma.evaluationTemplatePool.findUnique({
      where: { templateId: input.template_id },
      select: {
        templateId: true,
        codingWeight: true,
        verbalWeight: true,
        systemDesignWeight: true,
        totalDurationMinutes: true,
      },
    }),
  ])

  if (!job) {
    throw new ApiError(404, "JOB_NOT_FOUND", "job_id not found")
  }

  if (!template) {
    throw new ApiError(404, "TEMPLATE_NOT_FOUND", "template_id not found")
  }

  const interview = await prisma.interviewConfig.create({
    data: {
      jobId: input.job_id,
      templateId: input.template_id,
      codingWeight: input.coding_weight ?? template.codingWeight,
      verbalWeight: input.verbal_weight ?? template.verbalWeight,
      systemDesignWeight: input.system_design_weight ?? template.systemDesignWeight,
      totalDurationMinutes: input.total_duration_minutes ?? template.totalDurationMinutes,
      mode: input.mode,
    },
    select: { interviewId: true },
  })

  return { interview_id: interview.interviewId }
}
