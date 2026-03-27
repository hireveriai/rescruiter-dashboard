import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// ✅ Proper typing
type SendEmailParams = {
  to: string;
  name: string;
  link: string;
};

export async function sendInterviewEmail({ to, name, link }: SendEmailParams) {
  await resend.emails.send({
    from: process.env.EMAIL_FROM as string,
    to,
    subject: "Your HireVeri Interview Link",

    // ✅ MUST be inside backticks
    html: `
      <div style="font-family: Arial; line-height: 1.6;">
        <h2>You're invited to an interview</h2>
        
        <p>Hi ${name},</p>
        
        <p>Please start your interview using the link below:</p>
        
        <a href="${link}" 
           style="display:inline-block;padding:10px 16px;background:#000;color:#fff;text-decoration:none;border-radius:6px;">
           Start Interview
        </a>

        <p style="margin-top:20px;">
          This link will expire in 48 hours.
        </p>

        <p>— HireVeri</p>
      </div>
    `
  });
}