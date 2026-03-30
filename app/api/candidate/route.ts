import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { prisma } from "@/lib/server/prisma"
import { toFunctionApiError } from "@/lib/server/function-errors"
import { parseResumeText } from "@/lib/server/resumeParser"
import { uploadFileToS3 } from "@/lib/server/s3"

function getStringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : ""
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

type PdfParseResult = {
  text?: string
}

type PdfParseFn = (input: Buffer) => Promise<PdfParseResult>

async function extractResumeText(file: File) {
  const resumeBuffer = Buffer.from(await file.arrayBuffer())

  if (!isPdfFile(file)) {
    return null
  }

  try {
    const pdfParseModule = await import("pdf-parse")
    const pdfParse = (("default" in pdfParseModule ? pdfParseModule.default : pdfParseModule) as unknown) as PdfParseFn
    const parsed = await pdfParse(resumeBuffer)
    const text = parsed.text?.trim()

    return text || null
  } catch (error) {
    console.error("Failed to parse resume PDF", error)
    return null
  }
}

type CandidateFunctionRow = {
  candidate_id: string
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

    const job = await prisma.jobPosition.findFirst({
      where: {
        jobId,
        organizationId: auth.organizationId,
      },
      select: { organizationId: true },
    })

    if (!job) {
      return NextResponse.json(
        {
          success: false,
          message: "Job not found for this organization",
        },
        { status: 404 }
      )
    }

    let resumeUrl: string | null = null
    let resumeText: string | null = null
    let parsedResume: ReturnType<typeof parseResumeText> | null = null

    if (resumeEntry instanceof File && resumeEntry.size > 0) {
      resumeText = await extractResumeText(resumeEntry)
      resumeUrl = await uploadFileToS3(resumeEntry)

      if (resumeText) {
        try {
          parsedResume = parseResumeText(resumeText)
        } catch (error) {
          console.error("Failed to parse extracted resume text", error)
          parsedResume = null
        }
      }
    }

    const rows = await prisma.$queryRaw<CandidateFunctionRow[]>(Prisma.sql`
      select *
      from public.fn_upsert_candidate(
        ${auth.organizationId}::uuid,
        ${jobId}::uuid,
        ${fullName},
        ${email},
        ${resumeUrl},
        ${resumeText}
      )
    `)

    const result = rows[0]

    if (!result?.candidate_id) {
      throw new Error("Failed to create candidate")
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

    const apiError = toFunctionApiError(error, {
      statusCode: 500,
      code: "CANDIDATE_CREATE_FAILED",
      message: "Failed to create candidate",
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
