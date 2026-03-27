import { NextResponse } from "next/server"

import { prisma } from "@/lib/server/prisma"
import { parseResumeText } from "@/lib/server/resumeParser"
import { uploadFileToS3 } from "@/lib/server/s3"

function getStringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : ""
}

function getNameParts(fullName: string) {
  const parts = fullName.trim().split(/\s+/)

  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  }
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
}

async function extractResumeText(file: File) {
  const resumeBuffer = Buffer.from(await file.arrayBuffer())

  if (!isPdfFile(file)) {
    return null
  }

  try {
    const pdfParseModule = await import("pdf-parse")
    const parsed = await pdfParseModule.default(resumeBuffer)
    const text = parsed.text?.trim()

    return text || null
  } catch (error) {
    console.error("Failed to parse resume PDF", error)
    return null
  }
}

export async function POST(req: Request) {
  try {
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

    const job = await prisma.jobPosition.findUnique({
      where: { jobId },
      select: { organizationId: true },
    })

    if (!job) {
      return NextResponse.json(
        {
          success: false,
          message: "Job not found",
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

    const { firstName, lastName } = getNameParts(fullName)

    const result = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({
        where: { email },
        select: {
          userId: true,
          organizationId: true,
        },
      })

      if (user && user.organizationId !== job.organizationId) {
        throw new Error("User already exists under a different organization")
      }

      if (!user) {
        user = await tx.user.create({
          data: {
            organizationId: job.organizationId,
            fullName,
            email,
            role: "CANDIDATE",
            isActive: true,
            firstName,
            lastName,
          },
          select: {
            userId: true,
            organizationId: true,
          },
        })
      }

      const existingCandidate = await tx.candidate.findFirst({
        where: {
          OR: [{ userId: user.userId }, { email }],
        },
        select: {
          candidateId: true,
        },
      })

      const candidateData = {
        fullName,
        email,
        resumeUrl: resumeUrl ?? undefined,
        resumeText: resumeText ?? undefined,
        extractedSkills: parsedResume?.skills ?? undefined,
        experienceYears: parsedResume?.experienceYears ?? undefined,
      }

      if (existingCandidate) {
        const updatedCandidate = await tx.candidate.update({
          where: { candidateId: existingCandidate.candidateId },
          data: candidateData,
          select: {
            candidateId: true,
            resumeUrl: true,
            resumeText: true,
            extractedSkills: true,
            experienceYears: true,
          },
        })

        return updatedCandidate
      }

      return tx.candidate.create({
        data: {
          userId: user.userId,
          organizationId: job.organizationId,
          ...candidateData,
        },
        select: {
          candidateId: true,
          resumeUrl: true,
          resumeText: true,
          extractedSkills: true,
          experienceYears: true,
        },
      })
    })

    return NextResponse.json({
      success: true,
      candidateId: result.candidateId,
      resumeUrl: result.resumeUrl ?? null,
      parsedData: {
        resumeText: result.resumeText ?? null,
        extractedSkills: result.extractedSkills ?? [],
        experienceYears: result.experienceYears ?? null,
        parsedResume,
      },
    })
  } catch (error) {
    console.error(error)

    const message = error instanceof Error ? error.message : "Failed to create candidate"

    return NextResponse.json(
      {
        success: false,
        message,
      },
      { status: 500 }
    )
  }
}
