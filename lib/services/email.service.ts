import { Resend } from "resend";
import { formatOrgDateTime } from "@/lib/time";

const DEFAULT_EMAIL_FROM = "HireVeri Recruiter <no-reply@mil.hireveri.com>";
const MAX_EMAIL_ATTEMPTS = 3;
const RETRYABLE_EMAIL_ERROR_PATTERN = /(timeout|timed out|temporar|rate|429|5\d\d|network|fetch|econnreset|etimedout|socket)/i;

const globalForResend = globalThis as unknown as {
  hireveriResend?: Resend;
};

type SendEmailParams = {
  to: string;
  name: string;
  link: string;
  organizationTimezone?: string | null;
  organizationTimezoneLabel?: string | null;
  scheduledStartUtc?: string | Date | null;
  scheduledEndUtc?: string | Date | null;
};

type SendRecruiterAccessEmailParams = {
  to: string;
  name: string;
  organization: string;
  link: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  if (!globalForResend.hireveriResend) {
    globalForResend.hireveriResend = new Resend(apiKey);
  }

  return globalForResend.hireveriResend;
}

function getEmailFrom() {
  const configured = process.env.EMAIL_FROM?.trim();

  if (!configured || configured.includes("@resend.dev")) {
    return DEFAULT_EMAIL_FROM;
  }

  return configured;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown email delivery error";
}

function shouldRetryEmail(error: unknown) {
  return RETRYABLE_EMAIL_ERROR_PATTERN.test(getErrorMessage(error));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendWithRetry(payload: Parameters<Resend["emails"]["send"]>[0]) {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_EMAIL_ATTEMPTS; attempt += 1) {
    try {
      const response = await getResendClient().emails.send(payload);

      if (response.error) {
        throw new Error(response.error.message || "Resend failed to send email");
      }

      return response.data;
    } catch (error) {
      lastError = error;

      if (attempt === MAX_EMAIL_ATTEMPTS || !shouldRetryEmail(error)) {
        break;
      }

      await sleep(350 * 2 ** (attempt - 1));
    }
  }

  throw new Error(getErrorMessage(lastError));
}

export async function sendInterviewEmail({
  to,
  name,
  link,
  organizationTimezone,
  organizationTimezoneLabel,
  scheduledStartUtc,
  scheduledEndUtc,
}: SendEmailParams) {
  const safeName = escapeHtml(name || "Candidate");
  const safeLink = escapeHtml(link);

  const scheduleHtml =
    scheduledStartUtc && scheduledEndUtc
      ? `
        <p style="margin-top:20px;">
          Interview Scheduled:<br />
          <strong>${formatOrgDateTime(scheduledStartUtc, organizationTimezone ?? undefined)}</strong><br />
          <span style="color:#475569;">Ends ${formatOrgDateTime(scheduledEndUtc, organizationTimezone ?? undefined)}</span><br />
          <span style="color:#475569;">Timezone: ${organizationTimezoneLabel ?? organizationTimezone ?? "Organization Time"}</span>
        </p>
      `
      : ""

  return sendWithRetry({
    from: getEmailFrom(),
    to,
    subject: "Your HireVeri Interview Invitation",
    text: [
      `Hi ${name || "Candidate"},`,
      "You have been invited to complete an interview on HireVeri.",
      scheduledStartUtc && scheduledEndUtc
        ? `Interview window: ${formatOrgDateTime(scheduledStartUtc, organizationTimezone ?? undefined)} - ${formatOrgDateTime(scheduledEndUtc, organizationTimezone ?? undefined)}`
        : "",
      "Start interview:",
      link,
    ].filter(Boolean).join("\n"),
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">Your HireVeri interview is ready</h2>

        <p>Hi ${safeName},</p>

        <p>You have been invited to complete an interview on HireVeri. Use the secure link below to begin.</p>
        ${scheduleHtml}

        <a href="${safeLink}"
           style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">
           Start Interview
        </a>

        <p style="margin-top:16px;word-break:break-all;color:#475569;">${safeLink}</p>

        <p style="margin-top:20px;">
          Please use this link within the allowed access window configured for your interview.
        </p>

        <p style="margin-top:24px;">Regards,<br />HireVeri Recruiter Workspace</p>
      </div>
    `,
  });
}

export async function sendRecruiterAccessEmail({
  to,
  name,
  organization,
  link,
}: SendRecruiterAccessEmailParams) {
  const safeName = escapeHtml(name || "Recruiter");
  const safeOrganization = escapeHtml(organization || "your organization");
  const safeLink = escapeHtml(link);

  return sendWithRetry({
    from: getEmailFrom(),
    to,
    subject: `Your HireVeri recruiter access for ${organization}`,
    text: [
      `Hi ${name || "Recruiter"},`,
      `You have been added to the ${organization || "your organization"} team on HireVeri Recruiter.`,
      "Open workspace:",
      link,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">Your recruiter workspace access is ready</h2>

        <p>Hi ${safeName},</p>

        <p>
          You have been added to the <strong>${safeOrganization}</strong> team on HireVeri Recruiter.
          Use the secure workspace link below to sign in and continue.
        </p>

        <a href="${safeLink}"
           style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">
           Open Recruiter Workspace
        </a>

        <p style="margin-top:20px;">
          If you already have access, this email simply confirms your current team assignment.
        </p>

        <p style="margin-top:24px;">Regards,<br />HireVeri Recruiter Workspace</p>
      </div>
    `,
  });
}
