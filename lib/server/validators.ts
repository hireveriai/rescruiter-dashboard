import { z } from "zod"

const uuidField = z.string().uuid()

export const createJobSchema = z.object({
  organization_id: uuidField.optional(),
  job_title: z.string().trim().min(1),
  job_description: z.string().trim().optional().nullable(),
  experience_level_id: z.number().int().positive(),
  core_skills: z.array(z.string().trim().min(1)).default([]),
  difficulty_profile: z.enum(["JUNIOR", "MID", "SENIOR"]).default("MID"),
  skill_baseline: z
    .array(
      z.object({
        skill_domain: z.string().trim().min(1),
        expected_level: z.number().int().min(1).max(4),
      })
    )
    .default([]),
})

export const createInterviewConfigSchema = z.object({
  job_id: uuidField,
  template_id: uuidField,
  coding_weight: z.number().int().min(0).max(100).optional(),
  verbal_weight: z.number().int().min(0).max(100).optional(),
  system_design_weight: z.number().int().min(0).max(100).optional(),
  total_duration_minutes: z.number().int().positive().optional(),
  mode: z.string().trim().min(1).default("AI"),
})

export const createCandidateSchema = z.object({
  email: z.string().trim().email(),
  jobId: uuidField.optional(),
  job_id: uuidField.optional(),
  name: z.string().trim().min(1).optional(),
  fullName: z.string().trim().min(1).optional(),
})
.refine((value) => Boolean(value.name || value.fullName), {
  message: "name is required",
  path: ["name"],
})
.refine((value) => Boolean(value.jobId || value.job_id), {
  message: "jobId is required",
  path: ["jobId"],
})

export const inviteInterviewSchema = z.object({
  interview_id: uuidField,
  candidate_id: uuidField,
})

export const validateInterviewTokenSchema = z.object({
  token: z.string().trim().min(1),
})
