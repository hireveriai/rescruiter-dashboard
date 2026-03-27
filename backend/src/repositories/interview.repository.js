const crypto = require("crypto");
const db = require("../config/db");

async function findJobById(jobId, client = db) {
  const query = `
    SELECT
      job_id AS "jobId",
      organization_id AS "organizationId"
    FROM job_positions
    WHERE job_id = $1
    LIMIT 1
  `;

  const result = await client.query(query, [jobId]);
  return result.rows[0] || null;
}

async function findCandidateById(candidateId, client = db) {
  const query = `
    SELECT
      candidate_id AS "candidateId",
      organization_id AS "organizationId"
    FROM candidates
    WHERE candidate_id = $1
    LIMIT 1
  `;

  const result = await client.query(query, [candidateId]);
  return result.rows[0] || null;
}

async function createInterview(interview, client = db) {
  const query = `
    INSERT INTO interviews (
      organization_id,
      job_id,
      candidate_id,
      status,
      interview_type
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING interview_id AS "interviewId"
  `;

  const values = [
    interview.organizationId,
    interview.jobId,
    interview.candidateId,
    interview.status,
    interview.interviewType,
  ];

  const result = await client.query(query, values);
  return result.rows[0] || null;
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

async function createInvite(invite, client = db) {
  const query = `
    INSERT INTO interview_invites (
      interview_id,
      token,
      expires_at,
      status,
      attempts_used,
      max_attempts
    )
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      invite_id AS "inviteId",
      interview_id AS "interviewId",
      token,
      expires_at AS "expiresAt",
      status,
      attempts_used AS "attemptsUsed",
      max_attempts AS "maxAttempts"
  `;

  const values = [
    invite.interviewId,
    invite.token,
    invite.expiresAt,
    invite.status,
    invite.attemptsUsed,
    invite.maxAttempts,
  ];

  const result = await client.query(query, values);
  return result.rows[0];
}

async function generateUniqueToken(client = db) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(32).toString("hex");
    const exists = await tokenExists(token, client);

    if (!exists) {
      return token;
    }
  }

  throw new Error("Failed to generate a unique interview token");
}

module.exports = {
  findJobById,
  findCandidateById,
  createInterview,
  createInvite,
  generateUniqueToken,
};
