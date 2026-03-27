import { NextResponse } from "next/server"

import { prisma } from "@/lib/server/prisma"

export async function GET() {
  try {
    const jobs = await prisma.jobPosition.findMany({
      select: {
        jobId: true,
        jobTitle: true,
      },
      orderBy: {
        jobId: "desc",
      },
    })

    return NextResponse.json({
      success: true,
      jobs,
    })
  } catch (error) {
    console.error(error)

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch jobs",
      },
      { status: 500 }
    )
  }
}