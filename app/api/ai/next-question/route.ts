import { NextResponse } from "next/server"

import { generateQuestions } from "@/lib/server/ai/brain"
import { errorResponse } from "@/lib/server/response"

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const data = generateQuestions({
      roleType: body.roleType,
      totalQuestions: body.totalQuestions ?? 10,
      skillTags: body.skillTags ?? [],
      baseQuestions: body.baseQuestions ?? [],
      behavioralBank: body.behavioralBank ?? [],
    })

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
