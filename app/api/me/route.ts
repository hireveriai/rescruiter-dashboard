import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { getRecruiterProfile } from "@/lib/server/services/recruiter-profile"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const profile = await getRecruiterProfile(auth)

    return NextResponse.json({
      success: true,
      data: profile,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
