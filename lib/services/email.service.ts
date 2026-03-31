import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const DEFAULT_EMAIL_FROM = "HireVeri Recruiter <no-reply@mail.hireveri.com>";

type SendEmailParams = {
  to: string;
  name: string;
  link: string;
};

export async function sendInterviewEmail({ to, name, link }: SendEmailParams) {
  await resend.emails.send({
    from: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
    to,
    subject: "Your HireVeri Interview Invitation",
    html: `
      <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #0f172a;">
        <h2 style="margin-bottom: 12px;">Your HireVeri interview is ready</h2>

        <p>Hi ${name},</p>

        <p>You have been invited to complete an interview on HireVeri. Use the secure link below to begin.</p>

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
}
