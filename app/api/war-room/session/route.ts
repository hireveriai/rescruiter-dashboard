import { NextResponse } from "next/server"

import { getAuthTokenFromRequest, getHireveriSessionFromRequest, getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const token = getAuthTokenFromRequest(request)
    const hireveriSession = getHireveriSessionFromRequest(request)

    if (!token && !hireveriSession) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AUTH_HANDOFF_MISSING",
            message: "Authenticated session is not available for War Room handoff",
          },
        },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        authToken: token,
        hireveriSession,
        organizationId: auth.organizationId,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
