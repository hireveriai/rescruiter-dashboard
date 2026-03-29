import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/server/currentUser"
import { prisma } from "@/lib/server/prisma"

type RecruiterProfileRow = {
  recruiter_name: string
  organization_name: string
}

export async function GET() {
  try {
    const user = getCurrentUser()

    const rows = await prisma.$queryRaw<RecruiterProfileRow[]>(Prisma.sql`
      select *
      from public.fn_get_recruiter_profile(${user.userId}::uuid)
    `)

    const profile = rows[0]

    if (!profile) {
      return NextResponse.json(
        {
          success: false,
          message: "Recruiter not found",
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        name: profile.recruiter_name,
        organization: profile.organization_name,
      },
    })
  } catch (error) {
    console.error("Failed to fetch recruiter profile", error)

    return NextResponse.json(
      {
        success: false,
        message: "Failed to fetch recruiter profile",
      },
      { status: 500 }
    )
  }
}
