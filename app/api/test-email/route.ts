import { sendInterviewEmail } from "@/lib/services/email.service";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    await sendInterviewEmail({
      to: "jatin.singh@verihireai.work",
      name: "Jatin",
      link: "https://example.com"
    });

    return NextResponse.json({ success: true });

  } catch (err: any) {
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}