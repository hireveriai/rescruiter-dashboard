import { NextResponse } from "next/server"

import { getRecruiterRequestContext } from "@/lib/server/auth-context"
import { errorResponse } from "@/lib/server/response"
import { getInvoicePdfForDownload } from "@/lib/server/services/invoices"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(
  request: Request,
  context: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const auth = await getRecruiterRequestContext(request)
    const { invoiceId } = await context.params
    const invoice = await getInvoicePdfForDownload({
      auth,
      invoiceId,
    })

    return new NextResponse(invoice.pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.fileName}"`,
        "Cache-Control": "private, no-store",
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
