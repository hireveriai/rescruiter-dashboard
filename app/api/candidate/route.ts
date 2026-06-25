import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { prisma } from "@/lib/server/prisma"
import { toFunctionApiError } from "@/lib/server/function-errors"
import { extractResumeText } from "@/lib/server/ai-screening/resume-file"
import { parseResumeText } from "@/lib/server/resumeParser"
import { uploadBufferToS3 } from "@/lib/server/s3"
import { jobPositionsSupportIsActive } from "@/lib/server/services/jobs"
import { upsertCandidateScreenData } from "@/lib/server/services/recruiter-screen-writes"
import { createCandidateSchema } from "@/lib/server/validators"

export const runtime = "nodejs"

function getStringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : ""
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return "Unknown error"
}

type JobLookupRow = {
  organization_id: string
  is_active: boolean
}

export async function POST(req: Request) {
  try {
    const auth = await getRecruiterRequestContext(req)
    const formData = await req.formData()

    const fullName = getStringValue(formData.get("fullName"))
    const email = getStringValue(formData.get("email")).toLowerCase()
    const jobId = getStringValue(formData.get("jobId"))
    const resumeEntry = formData.get("resume")
    const includeResumeText = getStringValue(formData.get("includeResumeText")) !== "false"

    const candidateValidation = createCandidateSchema.safeParse({
      fullName,
      email,
      jobId,
    })

    if (!candidateValidation.success) {
      const issue = candidateValidation.error.issues[0]
      throw new ApiError(400, "INVALID_CANDIDATE_INPUT", issue?.message || "Invalid candidate input")
    }

    if (!fullName || !email || !jobId) {
      return NextResponse.json(
        {
          success: false,
          message: "fullName, email and jobId are required",
        },
        { status: 400 }
      )
    }

    const hasIsActive = await jobPositionsSupportIsActive()
    const jobs = (await prisma.$queryRaw(Prisma.sql`
      select
        organization_id,
        ${hasIsActive ? Prisma.sql`is_active` : Prisma.sql`true`} as is_active
      from public.job_positions
      where job_id = ${jobId}::uuid
        and organization_id = ${auth.organizationId}::uuid
      limit 1
    `)) as JobLookupRow[]
    const job = jobs[0]

    if (!job) {
      return NextResponse.json(
        {
          success: false,
          message: "Job not found for this organization",
        },
        { status: 404 }
      )
    }

    if (hasIsActive && job.is_active === false) {
      return NextResponse.json(
        {
          success: false,
          message: "This job is inactive and cannot accept new candidates",
        },
        { status: 409 }
      )
    }

    let resumeUrl: string | null = null
    let resumeText: string | null = null
    let parsedResume: ReturnType<typeof parseResumeText> | null = null
    if (!(resumeEntry instanceof File) || resumeEntry.size <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Resume is required",
        },
        { status: 400 }
      )
    }

    const resumeBuffer = Buffer.from(await resumeEntry.arrayBuffer())

    try {
      resumeText = await extractResumeText(resumeEntry, resumeBuffer)
    } catch (error) {
      console.error("Failed to extract resume text", error)
      throw new ApiError(
        400,
        "RESUME_PARSE_FAILED",
        `Could not read resume text from the uploaded file: ${getErrorMessage(error)}`
      )
    }

    if (!resumeText) {
      throw new ApiError(
        400,
        "RESUME_TEXT_EMPTY",
        "The uploaded resume could not be read. Please upload a valid PDF or DOCX resume."
      )
    }

    try {
      resumeUrl = await uploadBufferToS3({
        fileName: resumeEntry.name,
        contentType: resumeEntry.type,
        buffer: resumeBuffer,
      })
    } catch (error) {
      console.error("Failed to upload resume file", error)
      throw new ApiError(
        500,
        "RESUME_UPLOAD_FAILED",
        "Could not upload the resume file"
      )
    }

    try {
      parsedResume = parseResumeText(resumeText)
    } catch (error) {
      console.error("Failed to parse extracted resume text", error)
      parsedResume = null
    }

    const result = await upsertCandidateScreenData({
      organizationId: auth.organizationId,
      jobId,
      fullName,
      email,
      resumeUrl,
      resumeText,
    })

    if (!result?.candidate_id) {
      throw new Error("Failed to create candidate")
    }

    return NextResponse.json({
      success: true,
      candidateId: result.candidate_id,
      resumeUrl,
      parsedData: {
        resumeText: includeResumeText ? resumeText : undefined,
        extractedSkills: parsedResume?.skills ?? [],
        experienceYears: parsedResume?.experienceYears ?? null,
        parsedResume,
      },
    })
  } catch (error) {
    console.error(error)

    const errorMessage = getErrorMessage(error)

    const apiError = toFunctionApiError(error, {
      statusCode: 500,
      code: "CANDIDATE_CREATE_FAILED",
      message: errorMessage || "Failed to create candidate",
    })

    return NextResponse.json(
      {
        success: false,
        message: apiError.message,
      },
      { status: apiError.statusCode }
    )
  }
}
