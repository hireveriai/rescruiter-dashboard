import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/server/currentUser"
import { prisma } from "@/lib/server/prisma"

type PipelineFunctionRow = {
  fn_get_dashboard_pipeline: {
    pipeline?: {
      pending?: number
      inProgress?: number
      completed?: number
      flagged?: number
    }
    pendingInterviews?: Array<Record<string, unknown>>
    recordedInterviews?: Array<Record<string, unknown>>
  }
}

export async function GET() {
  try {
    const user = getCurrentUser()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

    const rows = await prisma.$queryRaw<PipelineFunctionRow[]>(Prisma.sql`
      select public.fn_get_dashboard_pipeline(
        ${user.organizationId}::uuid,
        ${appUrl}
      )
    `)

    const payload = rows[0]?.fn_get_dashboard_pipeline ?? {}

    return NextResponse.json({
      success: true,
      data: {
        pipeline: payload.pipeline ?? {
          pending: 0,
          inProgress: 0,
          completed: 0,
          flagged: 0,
        },
        pendingInterviews: payload.pendingInterviews ?? [],
        recordedInterviews: payload.recordedInterviews ?? [],
      },
    })
  } catch (error) {
    console.error("Failed to fetch interview pipeline", error)

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch interview pipeline",
      },
      { status: 500 }
    )
  }
}
