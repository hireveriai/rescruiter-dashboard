const db = require("../config/db");

const interviewDashboardSelect = `
  SELECT
    i.id,
    i.status,
    i.scheduled_at AS "scheduledAt",
    i.created_at AS "createdAt",
    i.updated_at AS "updatedAt",
    c.id AS "candidateId",
    c.first_name AS "candidateFirstName",
    c.last_name AS "candidateLastName",
    TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))) AS "candidateName",
    c.email AS "candidateEmail",
    c.phone AS "candidatePhone",
    jp.id AS "jobId",
    jp.title AS "jobTitle",
    jp.department,
    jp.location,
    invite_data.id AS "inviteId",
    invite_data.token,
    invite_data.status AS "inviteStatus",
    invite_data.expires_at AS "expiresAt",
    invite_data.attempts_used AS "attemptsUsed",
    fraud_data.risk_level AS "riskLevel",
    fraud_data.fraudSignalCount,
    recordings_data.recording_count AS "recordingCount",
    recordings_data.latest_recording_at AS "latestRecordingAt"
  FROM interviews i
  INNER JOIN candidates c ON c.id = i.candidate_id
  LEFT JOIN job_positions jp ON jp.id = i.job_position_id
  LEFT JOIN LATERAL (
    SELECT
      ii.id,
      ii.token,
      ii.status,
      ii.expires_at,
      ii.attempts_used
    FROM interview_invites ii
    WHERE ii.interview_id = i.id
    ORDER BY ii.created_at DESC NULLS LAST, ii.id DESC
    LIMIT 1
  ) invite_data ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      CASE MAX(
        CASE LOWER(COALESCE(fs.severity, 'low'))
          WHEN 'critical' THEN 4
          WHEN 'high' THEN 3
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 1
          ELSE 1
        END
      )
        WHEN 4 THEN 'CRITICAL'
        WHEN 3 THEN 'HIGH'
        WHEN 2 THEN 'MEDIUM'
        ELSE 'LOW'
      END AS risk_level,
      COUNT(*)::int AS "fraudSignalCount"
    FROM fraud_signals fs
    WHERE fs.interview_id = i.id
  ) fraud_data ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS recording_count,
      MAX(ir.created_at) AS latest_recording_at
    FROM interview_recordings ir
    WHERE ir.interview_id = i.id
  ) recordings_data ON TRUE
`;

async function findAllInterviewsDashboard() {
  const query = `
    ${interviewDashboardSelect}
    ORDER BY i.created_at DESC NULLS LAST, i.id DESC
  `;

  const result = await db.query(query, []);
  return result.rows;
}

async function findInterviewDashboardById(interviewId) {
  const query = `
    ${interviewDashboardSelect}
    WHERE i.id = $1
    LIMIT 1
  `;

  const result = await db.query(query, [interviewId]);
  return result.rows[0] || null;
}

module.exports = {
  findAllInterviewsDashboard,
  findInterviewDashboardById,
};
