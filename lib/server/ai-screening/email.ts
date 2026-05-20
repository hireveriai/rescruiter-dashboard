import { sendInterviewEmail } from "@/lib/services/email.service"

export async function sendAiScreeningInterviewEmail(input: {
  to: string
  name: string
  link: string
  companyName?: string | null
  companyLogo?: string | null
  roleTitle?: string | null
  duration?: string | number | null
  expiryDate?: string | Date | null
  subjectTemplate?: string | null
}) {
  return sendInterviewEmail({
    to: input.to,
    name: input.name,
    link: input.link,
    companyName: input.companyName,
    companyLogo: input.companyLogo,
    roleTitle: input.roleTitle,
    duration: input.duration,
    expiryDate: input.expiryDate,
    subjectTemplate: input.subjectTemplate,
  })
}
