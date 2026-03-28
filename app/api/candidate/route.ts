import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/server/currentUser"
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

type CandidateUserRow = {
  userId?: string
  organizationId?: string
  user_id?: string
  organization_id?: string
}

type CandidateRow = {
  candidate_id: string
  resume_url?: string | null
  resume_text?: string | null
  extracted_skills?: string[] | null
  experience_years?: number | null
}

type ColumnRow = {
  column_name: string
}

export async function POST(req: Request) {
  try {
    const user = getCurrentUser()
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
        organizationId: user.organizationId,
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

    const { firstName, lastName } = getNameParts(fullName)

    const result = await prisma.$transaction(async (tx) => {
      let candidateUser = await tx.user.findUnique({
        where: { email },
        select: {
          userId: true,
          organizationId: true,
        },
      }) as CandidateUserRow | null

      if (candidateUser && candidateUser.organizationId !== user.organizationId) {
        throw new Error("User already exists under a different organization")
      }

      if (!candidateUser) {
        const createdUsers = await tx.$queryRaw<CandidateUserRow[]>(Prisma.sql`
          insert into public.users (
            organization_id,
            full_name,
            email,
            role,
            is_active,
            first_name,
            last_name
          )
          values (
            ${user.organizationId}::uuid,
            ${fullName},
            ${email},
            'CANDIDATE',
            true,
            ${firstName},
            ${lastName}
          )
          returning user_id, organization_id
        `)

        candidateUser = createdUsers[0] ?? null
      }

      const candidateColumns = await tx.$queryRaw<ColumnRow[]>(Prisma.sql`
        select column_name
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'candidates'
      `)

      const columnSet = new Set(candidateColumns.map((column) => column.column_name))
      const hasResumeUrl = columnSet.has('resume_url')
      const hasResumeText = columnSet.has('resume_text')
      const hasExtractedSkills = columnSet.has('extracted_skills')
      const hasExperienceYears = columnSet.has('experience_years')

      const existingCandidates = await tx.$queryRaw<CandidateRow[]>(Prisma.sql`
        select candidate_id
        from public.candidates
        where organization_id = ${user.organizationId}::uuid
          and email = ${email}
        order by created_at desc
        limit 1
      `)

      const existingCandidate = existingCandidates[0]

      if (existingCandidate) {
        await tx.$executeRaw(Prisma.sql`
          update public.candidates
          set
            full_name = ${fullName},
            email = ${email}
          where candidate_id = ${existingCandidate.candidate_id}::uuid
        `)

        if (hasResumeUrl) {
          await tx.$executeRaw(Prisma.sql`
            update public.candidates
            set resume_url = ${resumeUrl}
            where candidate_id = ${existingCandidate.candidate_id}::uuid
          `)
        }

        if (hasResumeText) {
          await tx.$executeRaw(Prisma.sql`
            update public.candidates
            set resume_text = ${resumeText}
            where candidate_id = ${existingCandidate.candidate_id}::uuid
          `)
        }

        if (hasExtractedSkills) {
          await tx.$executeRaw(Prisma.sql`
            update public.candidates
            set extracted_skills = ${parsedResume?.skills ?? []}::text[]
            where candidate_id = ${existingCandidate.candidate_id}::uuid
          `)
        }

        if (hasExperienceYears) {
          await tx.$executeRaw(Prisma.sql`
            update public.candidates
            set experience_years = ${parsedResume?.experienceYears ?? null}
            where candidate_id = ${existingCandidate.candidate_id}::uuid
          `)
        }

        return {
          candidateId: existingCandidate.candidate_id,
          resumeUrl,
          resumeText,
          extractedSkills: parsedResume?.skills ?? [],
          experienceYears: parsedResume?.experienceYears ?? null,
        }
      }

      const createdCandidates = await tx.$queryRaw<CandidateRow[]>(Prisma.sql`
        insert into public.candidates (
          organization_id,
          full_name,
          email
        )
        values (
          ${user.organizationId}::uuid,
          ${fullName},
          ${email}
        )
        returning candidate_id
      `)

      const createdCandidate = createdCandidates[0]

      if (!createdCandidate) {
        throw new Error("Failed to create candidate")
      }

      if (hasResumeUrl) {
        await tx.$executeRaw(Prisma.sql`
          update public.candidates
          set resume_url = ${resumeUrl}
          where candidate_id = ${createdCandidate.candidate_id}::uuid
        `)
      }

      if (hasResumeText) {
        await tx.$executeRaw(Prisma.sql`
          update public.candidates
          set resume_text = ${resumeText}
          where candidate_id = ${createdCandidate.candidate_id}::uuid
        `)
      }

      if (hasExtractedSkills) {
        await tx.$executeRaw(Prisma.sql`
          update public.candidates
          set extracted_skills = ${parsedResume?.skills ?? []}::text[]
          where candidate_id = ${createdCandidate.candidate_id}::uuid
        `)
      }

      if (hasExperienceYears) {
        await tx.$executeRaw(Prisma.sql`
          update public.candidates
          set experience_years = ${parsedResume?.experienceYears ?? null}
          where candidate_id = ${createdCandidate.candidate_id}::uuid
        `)
      }

      return {
        candidateId: createdCandidate.candidate_id,
        resumeUrl,
        resumeText,
        extractedSkills: parsedResume?.skills ?? [],
        experienceYears: parsedResume?.experienceYears ?? null,
      }
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
