import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/server/currentUser"
import { prisma } from "@/lib/server/prisma"

export async function GET() {
  try {
    const user = getCurrentUser()

    const jobs = await prisma.jobPosition.findMany({
      where: {
        organizationId: user.organizationId,
      },
      orderBy: {
        jobId: "desc",
      },
      select: {
        jobId: true,
        jobTitle: true,
        jobDescription: true,
        experienceLevelId: true,
        difficultyProfile: true,
        coreSkills: true,
        _count: {
          select: {
            interviews: true,
          },
        },
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
