const ApiError = require("../utils/api-error");
const db = require("../config/db");
const interviewRepository = require("../repositories/interview.repository");

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedInterviewTypes = new Set(["SELF_TEST", "COMPANY_INTERVIEW"]);

function isUuid(value) {
  return uuidPattern.test(String(value || "").trim());
}

function validatePayload(payload) {
  const jobId = String(payload.jobId || payload.job_id || "").trim();
  const candidateId = String(payload.candidateId || payload.candidate_id || "").trim();
  const interviewType = String(
    payload.interviewType || payload.interview_type || "COMPANY_INTERVIEW"
  )
    .trim()
    .toUpperCase();

  if (!isUuid(jobId)) {
    throw new ApiError(400, "jobId is required and must be a valid UUID");
  }

  if (!isUuid(candidateId)) {
    throw new ApiError(400, "candidateId is required and must be a valid UUID");
  }

  if (!allowedInterviewTypes.has(interviewType)) {
    throw new ApiError(400, "interviewType must be SELF_TEST or COMPANY_INTERVIEW");
  }

  return { jobId, candidateId, interviewType };
}

async function createInterviewLink(payload) {
  const { jobId, candidateId, interviewType } = validatePayload(payload);
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    const [job, candidate] = await Promise.all([
      interviewRepository.findJobById(jobId, client),
      interviewRepository.findCandidateById(candidateId, client),
    ]);

    if (!job) {
      throw new ApiError(404, "job not found");
    }

    if (!candidate) {
      throw new ApiError(404, "candidate not found");
    }

    if (job.organizationId !== candidate.organizationId) {
      throw new ApiError(400, "job and candidate belong to different organizations");
    }

    const interview = await interviewRepository.createInterview(
      {
        organizationId: candidate.organizationId,
        jobId,
        candidateId,
        status: "PENDING",
        interviewType,
      },
      client
    );

    if (!interview) {
      throw new ApiError(500, "failed to create interview");
    }

    const token = await interviewRepository.generateUniqueToken(client);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await interviewRepository.createInvite(
      {
        interviewId: interview.interviewId,
        token,
        expiresAt: expiresAt.toISOString(),
        status: "ACTIVE",
        attemptsUsed: 0,
        maxAttempts: 1,
      },
      client
    );

    await client.query("COMMIT");

    return {
      success: true,
      link: `http://localhost:3000/interview/${token}`,
      interviewId: interview.interviewId,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createInterviewLink,
};
