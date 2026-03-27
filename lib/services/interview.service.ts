import { prisma } from "../prisma";
import { v4 as uuidv4 } from "uuid";

export async function createInterviewLink({ jobId, candidateId }) {

  // ✅ Validate job
  const job = await prisma.job_positions.findUnique({
    where: { job_id: jobId }
  });

  if (!job) throw new Error("Invalid job");

  // ✅ Validate candidate
  const candidate = await prisma.candidates.findUnique({
    where: { candidate_id: candidateId }
  });

  if (!candidate) throw new Error("Invalid candidate");

  // ✅ Find or create interview_config
  let interview = await prisma.interview_configs.findFirst({
    where: { job_id: jobId }
  });

  if (!interview) {
    interview = await prisma.interview_configs.create({
      data: {
        job_id: jobId,
        total_duration_minutes: 60,
        mode: "AI",
        is_active: true
      }
    });
  }

  // ✅ Token
  const token = uuidv4();

  // ✅ Expiry
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  // ✅ Insert invite
  await prisma.interview_invites.create({
    data: {
      interview_id: interview.interview_id,
      candidate_id: candidateId,
      token,
      status: "ACTIVE",
      expires_at: expiresAt
    }
  });

  return {
    link: `${process.env.NEXT_PUBLIC_APP_URL}/interview/${token}`,
    interviewId: interview.interview_id
  };
}