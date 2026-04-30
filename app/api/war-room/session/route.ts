import { NextResponse } from "next/server"

import { getAuthTokenFromRequest, getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"

export async function GET(request: Request) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const token = getAuthTokenFromRequest(request)

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "AUTH_TOKEN_MISSING",
            message: "Authenticated token is not available for War Room handoff",
          },
        },
        { status: 401 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        authToken: token,
        organizationId: auth.organizationId,
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
