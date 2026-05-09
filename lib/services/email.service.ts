import { Resend } from "resend";
import { formatOrgDateTime } from "@/lib/time";

const resend = new Resend(process.env.RESEND_API_KEY);
const DEFAULT_EMAIL_FROM = "HireVeri Recruiter <no-reply@mil.hireveri.com>";

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

export async function sendInterviewEmail({
  to,
  name,
  link,
  organizationTimezone,
  organizationTimezoneLabel,
  scheduledStartUtc,
  scheduledEndUtc,
}: SendEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

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

  const response = await resend.emails.send({
    from: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
    to,
    subject: "Your HireVeri Interview Invitation",
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">Your HireVeri interview is ready</h2>

        <p>Hi ${name},</p>

        <p>You have been invited to complete an interview on HireVeri. Use the secure link below to begin.</p>
        ${scheduleHtml}

        <a href="${link}"
           style="display:inline-block;padding:12px 18px;background:#0f172a;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">
           Start Interview
        </a>

        <p style="margin-top:20px;">
          Please use this link within the allowed access window configured for your interview.
        </p>

        <p style="margin-top:24px;">Regards,<br />HireVeri Recruiter Workspace</p>
      </div>
    `,
  });

  if (response.error) {
    throw new Error(response.error.message || "Resend failed to send email");
  }

  return response.data;
}

export async function sendRecruiterAccessEmail({
  to,
  name,
  organization,
  link,
}: SendRecruiterAccessEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const response = await resend.emails.send({
    from: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
    to,
    subject: `Your HireVeri recruiter access for ${organization}`,
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">Your recruiter workspace access is ready</h2>

        <p>Hi ${name},</p>

        <p>
          You have been added to the <strong>${organization}</strong> team on HireVeri Recruiter.
          Use the secure workspace link below to sign in and continue.
        </p>

        <a href="${link}"
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

  if (response.error) {
    throw new Error(response.error.message || "Resend failed to send recruiter access email");
  }

  return response.data;
}
