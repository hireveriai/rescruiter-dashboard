const ApiError = require("../utils/api-error");
const db = require("../config/db");
const interviewInviteRepository = require("../repositories/interview-invite.repository");

const activeInviteStatus = "ACTIVE";
const validInviteStatuses = new Set(["ACTIVE", "EXPIRED", "USED"]);
const defaultInterviewStatus = "SCHEDULED";

function normalizeCreateLinkPayload(payload) {
  const interviewId =
    payload.interviewId === undefined || payload.interviewId === null || payload.interviewId === ""
      ? null
      : Number(payload.interviewId);
  const candidateId =
    payload.candidateId === undefined || payload.candidateId === null || payload.candidateId === ""
      ? null
      : Number(payload.candidateId);
  const jobId =
    payload.jobId === undefined || payload.jobId === null || payload.jobId === ""
      ? null
      : Number(payload.jobId);
  const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;
  const expiresInHours =
    payload.expiresInHours === undefined || payload.expiresInHours === null || payload.expiresInHours === ""
      ? 48
      : Number(payload.expiresInHours);

  if (interviewId !== null && (!Number.isInteger(interviewId) || interviewId <= 0)) {
    throw new ApiError(400, "interviewId must be a positive integer");
  }

  if (interviewId === null) {
    if (!Number.isInteger(candidateId) || candidateId <= 0) {
      throw new ApiError(400, "candidateId is required when interviewId is not provided");
    }

    if (!Number.isInteger(jobId) || jobId <= 0) {
      throw new ApiError(400, "jobId is required when interviewId is not provided");
    }
  }

  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    throw new ApiError(400, "scheduledAt must be a valid ISO date-time");
  }

  if (!Number.isFinite(expiresInHours) || expiresInHours <= 0) {
    throw new ApiError(400, "expiresInHours must be a positive number");
  }

  return {
    interviewId,
    candidateId,
    jobId,
    scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
    expiresInHours,
  };
}

function deriveInviteStatus(expiresAt, attemptsUsed) {
  if (attemptsUsed > 0) {
    return "USED";
  }

  if (new Date(expiresAt) <= new Date()) {
    return "EXPIRED";
  }

  return activeInviteStatus;
}

async function getOrCreateInterview(payload, client) {
  if (payload.interviewId) {
    const existingInterview = await interviewInviteRepository.findInterviewById(
      payload.interviewId,
      client
    );

    if (!existingInterview) {
      throw new ApiError(404, "interview not found");
    }

    return existingInterview;
  }

  return interviewInviteRepository.createInterview(
    {
      candidateId: payload.candidateId,
      jobId: payload.jobId,
      scheduledAt: payload.scheduledAt,
      status: defaultInterviewStatus,
    },
    client
  );
}

async function createInterviewLink(payload) {
  const normalizedPayload = normalizeCreateLinkPayload(payload);
  const client = await db.getClient();

  try {
    await client.query("BEGIN");

    const interview = await getOrCreateInterview(normalizedPayload, client);

    await interviewInviteRepository.expireStaleInvites(interview.id, client);
    await interviewInviteRepository.deactivateActiveInvites(interview.id, client);

    const token = await interviewInviteRepository.generateUniqueToken(client);
    const expiresAt = new Date(Date.now() + normalizedPayload.expiresInHours * 60 * 60 * 1000);
    const status = deriveInviteStatus(expiresAt, 0);

    if (!validInviteStatuses.has(status)) {
      throw new ApiError(500, "invalid invite status generated");
    }

    const invite = await interviewInviteRepository.createInvite(
      {
        interviewId: interview.id,
        token,
        expiresAt: expiresAt.toISOString(),
        attemptsUsed: 0,
        status,
      },
      client
    );

    await client.query("COMMIT");

    return {
      interview,
      invite: {
        ...invite,
        link: `/interview/${invite.token}`,
      },
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
