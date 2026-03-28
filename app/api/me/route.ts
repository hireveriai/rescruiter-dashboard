import { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"

import { getCurrentUser } from "@/lib/server/currentUser"
import { prisma } from "@/lib/server/prisma"

type OrganizationRow = {
  organization_name: string
}

export async function GET() {
  try {
    const user = getCurrentUser()

    const dbUser = await prisma.user.findUnique({
      where: { userId: user.userId },
      select: {
        fullName: true,
        organizationId: true,
      },
    })

    if (!dbUser) {
      return NextResponse.json(
        {
          success: false,
          message: "Recruiter not found",
        },
        { status: 404 }
      )
    }

    const organizations = await prisma.$queryRaw<OrganizationRow[]>(Prisma.sql`
      select organization_name
      from public.organizations
      where organization_id = ${dbUser.organizationId}::uuid
      limit 1
    `)

    return NextResponse.json({
      success: true,
      data: {
        name: dbUser.fullName ?? "Unknown Recruiter",
        organization: organizations[0]?.organization_name ?? "",
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
