import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
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

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)

    const rows = await prisma.$queryRaw<VerisRow[]>(Prisma.sql`
      select *
      from public.fn_get_dashboard_veris(${auth.organizationId}::uuid, 6)
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
    return errorResponse(error)
  }
}
