import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { ApiError } from "@/lib/server/errors"
import { prisma } from "@/lib/server/prisma"
import { toFunctionApiError } from "@/lib/server/function-errors"
import { parseResumeText } from "@/lib/server/resumeParser"
import { uploadBufferToS3 } from "@/lib/server/s3"
import { jobPositionsSupportIsActive } from "@/lib/server/services/jobs"

export const runtime = "nodejs"

function getStringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : ""
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

function isDocxFile(file: File) {
  return (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.toLowerCase().endsWith(".docx")
  )
}

type PdfParseResult = {
  text?: string
}

type PdfParseFn = (input: Buffer) => Promise<PdfParseResult>

async function extractResumeText(file: File, resumeBuffer: Buffer) {
  try {
    if (isPdfFile(file)) {
      const pdfParseModule = await import("pdf-parse")
      const pdfParse = (("default" in pdfParseModule ? pdfParseModule.default : pdfParseModule) as unknown) as PdfParseFn
      const parsed = await pdfParse(resumeBuffer)
      const text = parsed.text?.trim()

      return text || null
    }

    if (isDocxFile(file)) {
      const mammothModule = await import("mammoth")
      const mammoth = "default" in mammothModule ? mammothModule.default : mammothModule
      const parsed = await mammoth.extractRawText({ buffer: resumeBuffer })
      const text = parsed.value?.trim()

      return text || null
    }

    return null
  } catch (error) {
    console.error("Failed to parse resume file", error)
    return null
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return "Unknown error"
}

type CandidateFunctionRow = {
  candidate_id: string
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
    const jobs = await prisma.$queryRaw<JobLookupRow[]>(Prisma.sql`
      select
        organization_id,
        ${hasIsActive ? Prisma.sql`is_active` : Prisma.sql`true`} as is_active
      from public.job_positions
      where job_id = ${jobId}::uuid
        and organization_id = ${auth.organizationId}::uuid
      limit 1
    `)
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
        500,
        "RESUME_PARSE_FAILED",
        "Could not read resume text from the uploaded file"
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

    const rows = (await prisma.$queryRaw`
      select *
      from public.fn_upsert_candidate(
        ${auth.organizationId}::uuid,
        ${jobId}::uuid,
        ${fullName},
        ${email},
        ${resumeUrl},
        ${resumeText}
      )
    `) as CandidateFunctionRow[]

    const result = rows[0]

    if (!result?.candidate_id) {
      throw new Error("Failed to create candidate")
    }

    if (resumeUrl || resumeText) {
      try {
        await prisma.$executeRaw(Prisma.sql`
          update public.candidates
          set
            resume_url = coalesce(${resumeUrl}, resume_url),
            resume_text = coalesce(${resumeText}, resume_text)
          where candidate_id = ${result.candidate_id}::uuid
            and organization_id = ${auth.organizationId}::uuid
        `)
      } catch (persistError) {
        console.error("Failed to persist resume data on candidate row", persistError)
      }
    }

    return NextResponse.json({
      success: true,
      candidateId: result.candidate_id,
      resumeUrl,
      parsedData: {
        resumeText,
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
