import { NextResponse } from "next/server"

import { validateInterviewTokenSchema } from "@/lib/server/validators"
import { validateInterviewToken } from "@/lib/server/services/interview.service"

const reasonMap = {
  INVALID_TOKEN: "INVALID",
  INACTIVE: "USED_OR_CANCELLED",
  EXPIRED: "EXPIRED",
  USED: "ALREADY_USED",
  INVALID_TIME_WINDOW: "INVALID_TIME_WINDOW",
  NOT_STARTED: "NOT_STARTED",
} as const

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = validateInterviewTokenSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          valid: false,
          reason: "INVALID",
        },
        { status: 400 }
      )
    }

    const result = await validateInterviewToken(parsed.data)

    if (!result.valid) {
      return NextResponse.json(
        {
          valid: false,
          reason: reasonMap[result.reason ?? "INVALID_TOKEN"],
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        valid: true,
        interviewId: result.interviewId,
        candidateId: result.candidateId,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error(error)

    return NextResponse.json(
      {
        valid: false,
        reason: "SERVER_ERROR",
      },
      { status: 500 }
    )
  }
}
