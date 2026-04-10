import type { z } from "zod"
import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/server/prisma"
import { ApiError } from "@/lib/server/errors"
import { createInterviewConfigSchema } from "@/lib/server/validators"

type CreateInterviewConfigInput = z.infer<typeof createInterviewConfigSchema>

type JobRoleRow = {
  coding_required: string | null
  coding_recommended: boolean | null
}

type BehavioralWeights = {
  codingWeight: number
  verbalWeight: number
  systemDesignWeight: number
}

function resolveBehavioralTarget(codingRequired: string | null) {
  const normalized = String(codingRequired ?? "AUTO").toUpperCase()

  if (normalized === "YES") {
    return 20
  }

  if (normalized === "NO") {
    return 45
  }

  return 30
}

function applyBehavioralWeights(params: {
  codingWeight: number
  systemDesignWeight: number
  targetBehavioral: number
}): BehavioralWeights {
  const remaining = Math.max(0, 100 - params.targetBehavioral)
  const otherTotal = Math.max(0, params.codingWeight) + Math.max(0, params.systemDesignWeight)

  if (otherTotal === 0) {
    return {
      codingWeight: remaining,
      systemDesignWeight: 0,
      verbalWeight: params.targetBehavioral,
    }
  }

  const scaledCoding = Math.round((remaining * Math.max(0, params.codingWeight)) / otherTotal)
  const scaledSystem = remaining - scaledCoding

  return {
    codingWeight: scaledCoding,
    systemDesignWeight: scaledSystem,
    verbalWeight: params.targetBehavioral,
  }
}

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

  const jobRoleRows = await prisma.$queryRaw<JobRoleRow[]>(Prisma.sql`
    select jp.coding_required, jp.coding_recommended
    from public.job_positions jp
    where jp.job_id = ${input.job_id}::uuid
    limit 1
  `)

  const jobRole = jobRoleRows[0] ?? { coding_required: "AUTO", coding_recommended: null }
  const targetBehavioral = resolveBehavioralTarget(jobRole.coding_required)

  const baseCodingWeight = input.coding_weight ?? template.codingWeight ?? 0
  const baseSystemWeight = input.system_design_weight ?? template.systemDesignWeight ?? 0
  const adjustedWeights = applyBehavioralWeights({
    codingWeight: baseCodingWeight,
    systemDesignWeight: baseSystemWeight,
    targetBehavioral,
  })

  const interview = await prisma.interviewConfig.create({
    data: {
      jobId: input.job_id,
      templateId: input.template_id,
      codingWeight: adjustedWeights.codingWeight,
      verbalWeight: adjustedWeights.verbalWeight,
      systemDesignWeight: adjustedWeights.systemDesignWeight,
      totalDurationMinutes: input.total_duration_minutes ?? template.totalDurationMinutes,
      mode: input.mode,
    },
    select: { interviewId: true },
  })

  return { interview_id: interview.interviewId }
}
