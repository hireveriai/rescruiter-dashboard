import { Resend } from "resend"

const DEFAULT_EMAIL_FROM = "HireVeri Recruiter <no-reply@mil.hireveri.com>"

const globalForResend = globalThis as unknown as {
  aiScreeningResend?: Resend
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim()

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured")
  }

  if (!globalForResend.aiScreeningResend) {
    globalForResend.aiScreeningResend = new Resend(apiKey)
  }

  return globalForResend.aiScreeningResend
}

export async function sendAiScreeningInterviewEmail(input: {
  to: string
  name: string
  link: string
}) {
  const safeName = escapeHtml(input.name || "Candidate")
  const safeLink = escapeHtml(input.link)
  const response = await getResendClient().emails.send({
    from: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
    to: input.to,
    subject: "Interview Invitation from HireVeri",
    text: [
      `Hi ${input.name || "Candidate"},`,
      "You have been shortlisted.",
      "Click below to start your interview:",
      input.link,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #0f172a;">
        <p>Hi ${safeName},</p>
        <p>You have been shortlisted.</p>
        <p>Click below to start your interview:</p>
        <p>
          <a href="${safeLink}" style="display:inline-block;padding:12px 18px;background:#0f172a;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;">
            Start Interview
          </a>
        </p>
        <p style="word-break:break-all;">${safeLink}</p>
      </div>
    `,
  })

  if (response.error) {
    throw new Error(response.error.message || "Resend failed to send interview invitation")
  }

  return response.data
}
