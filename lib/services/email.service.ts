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

type SendRecruiterOnboardingEmailParams = SendRecruiterAccessEmailParams & {
  role: string;
  inviterName: string;
  expiresAt: string | Date;
};

type SendRecruiterOrganizationAddedEmailParams = SendRecruiterAccessEmailParams & {
  role: string;
  inviterName: string;
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

  return configured || DEFAULT_EMAIL_FROM;
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

function recruiterShellHtml(content: string) {
  return `
    <div style="margin:0;padding:0;background:#081120;font-family:Arial,Helvetica,sans-serif;color:#e2e8f0;">
      <div style="max-width:640px;margin:0 auto;padding:32px 18px;">
        <div style="border:1px solid rgba(51,65,85,0.9);border-radius:24px;overflow:hidden;background:linear-gradient(180deg,#0f172a,#0a1222);box-shadow:0 24px 80px rgba(2,6,23,0.45);">
          <div style="padding:26px 28px;border-bottom:1px solid rgba(51,65,85,0.75);background:radial-gradient(circle at top right,rgba(59,130,246,0.18),transparent 34%);">
            <div style="font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#93c5fd;">HireVeri Recruiter</div>
            <h1 style="margin:12px 0 0;font-size:24px;line-height:1.25;color:#ffffff;">Organization access</h1>
          </div>
          <div style="padding:28px;">
            ${content}
          </div>
        </div>
      </div>
    </div>
  `;
}

function actionButtonHtml(link: string, label: string) {
  return `
    <a href="${escapeHtml(link)}"
       style="display:inline-block;margin-top:18px;padding:13px 18px;border-radius:12px;background:#ffffff;color:#0f172a;text-decoration:none;font-weight:700;">
      ${escapeHtml(label)}
    </a>
  `;
}

export async function sendRecruiterOnboardingEmail({
  to,
  name,
  organization,
  role,
  inviterName,
  link,
  expiresAt,
}: SendRecruiterOnboardingEmailParams) {
  const safeName = escapeHtml(name || "Recruiter");
  const safeOrganization = escapeHtml(organization || "your organization");
  const safeRole = escapeHtml(role || "Recruiter");
  const safeInviter = escapeHtml(inviterName || "your team admin");
  const expiry = expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt;

  return sendWithRetry({
    from: getEmailFrom(),
    to,
    subject: `Set up your HireVeri access for ${organization}`,
    text: [
      `Hi ${name || "Recruiter"},`,
      `${inviterName || "Your team admin"} invited you to ${organization || "your organization"} on HireVeri Recruiter.`,
      `Assigned role: ${role || "Recruiter"}`,
      `This setup link expires at ${expiry}.`,
      "Set up access:",
      link,
    ].join("\n"),
    html: recruiterShellHtml(`
      <p style="margin:0 0 14px;color:#cbd5e1;font-size:15px;line-height:1.7;">Hi ${safeName},</p>
      <p style="margin:0 0 18px;color:#cbd5e1;font-size:15px;line-height:1.7;">
        ${safeInviter} invited you to join <strong style="color:#ffffff;">${safeOrganization}</strong> on HireVeri Recruiter.
      </p>
      <div style="margin:18px 0;padding:14px 16px;border:1px solid rgba(59,130,246,0.24);border-radius:16px;background:rgba(15,23,42,0.72);">
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#94a3b8;">Assigned Role</div>
        <div style="margin-top:6px;color:#bfdbfe;font-size:16px;font-weight:700;">${safeRole}</div>
      </div>
      <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">Use the secure setup link below. It expires at ${escapeHtml(expiry)}.</p>
      ${actionButtonHtml(link, "Set Up Recruiter Access")}
      <p style="margin-top:18px;word-break:break-all;color:#64748b;font-size:12px;">${escapeHtml(link)}</p>
    `),
  });
}

export async function sendRecruiterOrganizationAddedEmail({
  to,
  name,
  organization,
  role,
  inviterName,
  link,
}: SendRecruiterOrganizationAddedEmailParams) {
  const safeName = escapeHtml(name || "Recruiter");
  const safeOrganization = escapeHtml(organization || "your organization");
  const safeRole = escapeHtml(role || "Recruiter");
  const safeInviter = escapeHtml(inviterName || "your team admin");

  return sendWithRetry({
    from: getEmailFrom(),
    to,
    subject: `You were added to ${organization} on HireVeri`,
    text: [
      `Hi ${name || "Recruiter"},`,
      `You were added to organization ${organization || "your organization"} by ${inviterName || "your team admin"}.`,
      `Assigned role: ${role || "Recruiter"}`,
      "Open workspace:",
      link,
    ].join("\n"),
    html: recruiterShellHtml(`
      <p style="margin:0 0 14px;color:#cbd5e1;font-size:15px;line-height:1.7;">Hi ${safeName},</p>
      <p style="margin:0 0 18px;color:#cbd5e1;font-size:15px;line-height:1.7;">
        ${safeInviter} added you to organization <strong style="color:#ffffff;">${safeOrganization}</strong>.
      </p>
      <div style="margin:18px 0;padding:14px 16px;border:1px solid rgba(16,185,129,0.24);border-radius:16px;background:rgba(15,23,42,0.72);">
        <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#94a3b8;">Assigned Role</div>
        <div style="margin-top:6px;color:#a7f3d0;font-size:16px;font-weight:700;">${safeRole}</div>
      </div>
      ${actionButtonHtml(link, "Open Recruiter Workspace")}
    `),
  });
}
