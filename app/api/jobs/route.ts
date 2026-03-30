import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { prisma } from "@/lib/server/prisma"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)

    const jobs = await prisma.jobPosition.findMany({
      where: {
        organizationId: auth.organizationId,
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
    return errorResponse(error)
  }
}
