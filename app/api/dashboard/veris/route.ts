import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/server/currentUser"
import { prisma } from "@/lib/server/prisma"

type VerisRow = {
  attempt_id: string
  overall_score: number | null
  risk_level: string | null
  strengths: string | null
  weaknesses: string | null
  hire_recommendation: string | null
  created_at: Date | string | null
  candidate_name: string
  job_title: string
}

function shorten(text: string | null, words = 18) {
  if (!text) {
    return "-"
  }

  const parts = text.trim().split(/\s+/).filter(Boolean)
  if (parts.length <= words) {
    return parts.join(" ")
  }

  return `${parts.slice(0, words).join(" ")}...`
}

export async function GET() {
  try {
    const user = getCurrentUser()

    const rows = await prisma.$queryRaw<VerisRow[]>(Prisma.sql`
      select
        s.attempt_id,
        s.overall_score,
        s.risk_level,
        s.strengths,
        s.weaknesses,
        s.hire_recommendation,
        s.created_at,
        c.full_name as candidate_name,
        jp.job_title
      from public.interview_summaries s
      inner join public.interview_attempts ia on ia.attempt_id = s.attempt_id
      inner join public.interviews i on i.interview_id = ia.interview_id
      inner join public.candidates c on c.candidate_id = i.candidate_id
      inner join public.job_positions jp on jp.job_id = i.job_id
      where i.organization_id = ${user.organizationId}::uuid
      order by s.created_at desc
      limit 6
    `)

    return NextResponse.json({
      success: true,
      data: rows.map((row) => ({
        attemptId: row.attempt_id,
        candidateName: row.candidate_name,
        jobTitle: row.job_title,
        overallScore: row.overall_score,
        riskLevel: row.risk_level ?? "-",
        recommendation: row.hire_recommendation ?? "-",
        strengths: row.strengths ?? "-",
        weaknesses: row.weaknesses ?? "-",
        strengthsShort: shorten(row.strengths),
        weaknessesShort: shorten(row.weaknesses),
        createdAt: row.created_at,
      })),
    })
  } catch (error) {
    console.error("Failed to fetch VERIS summaries", error)

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch VERIS summaries",
      },
      { status: 500 }
    )
  }
}
