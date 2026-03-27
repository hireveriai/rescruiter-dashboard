const crypto = require("crypto");
const db = require("../config/db");

async function findInterviewById(interviewId, client = db) {
  const query = `
    SELECT
      i.id,
      i.candidate_id AS "candidateId",
      i.job_position_id AS "jobId",
      i.scheduled_at AS "scheduledAt",
      i.status,
      i.created_at AS "createdAt",
      i.updated_at AS "updatedAt"
    FROM interviews i
    WHERE i.id = $1
    LIMIT 1
  `;

  const result = await client.query(query, [interviewId]);
  return result.rows[0] || null;
}

async function createInterview(interview, client = db) {
  const query = `
    INSERT INTO interviews (
      candidate_id,
      job_position_id,
      scheduled_at,
      status
    )
    VALUES ($1, $2, $3, $4)
    RETURNING
      id,
      candidate_id AS "candidateId",
      job_position_id AS "jobId",
      scheduled_at AS "scheduledAt",
      status,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  const values = [
    interview.candidateId,
    interview.jobId,
    interview.scheduledAt,
    interview.status,
  ];

  const result = await client.query(query, values);
  return result.rows[0];
}

async function expireStaleInvites(interviewId, client = db) {
  const query = `
    UPDATE interview_invites
    SET status = 'EXPIRED'
    WHERE interview_id = $1
      AND status = 'ACTIVE'
      AND expires_at <= NOW()
    RETURNING id
  `;

  const result = await client.query(query, [interviewId]);
  return result.rowCount;
}

async function deactivateActiveInvites(interviewId, client = db) {
  const query = `
    UPDATE interview_invites
    SET status = CASE
      WHEN attempts_used > 0 THEN 'USED'
      WHEN expires_at <= NOW() THEN 'EXPIRED'
      ELSE 'EXPIRED'
    END
    WHERE interview_id = $1
      AND status = 'ACTIVE'
    RETURNING id
  `;

  const result = await client.query(query, [interviewId]);
  return result.rowCount;
}

async function tokenExists(token, client = db) {
  const query = `
    SELECT 1
    FROM interview_invites
    WHERE token = $1
    LIMIT 1
  `;

  const result = await client.query(query, [token]);
  return result.rowCount > 0;
}

async function generateUniqueToken(client = db) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(32).toString("hex");
    const exists = await tokenExists(token, client);

    if (!exists) {
      return token;
    }
  }

  throw new Error("Failed to generate a unique interview invite token");
}

async function createInvite(invite, client = db) {
  const query = `
    INSERT INTO interview_invites (
      interview_id,
      token,
      expires_at,
      attempts_used,
      status
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING
      id,
      interview_id AS "interviewId",
      token,
      expires_at AS "expiresAt",
      attempts_used AS "attemptsUsed",
      status,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `;

  const values = [
    invite.interviewId,
    invite.token,
    invite.expiresAt,
    invite.attemptsUsed,
    invite.status,
  ];

  const result = await client.query(query, values);
  return result.rows[0];
}

module.exports = {
  findInterviewById,
  createInterview,
  expireStaleInvites,
  deactivateActiveInvites,
  generateUniqueToken,
  createInvite,
};
