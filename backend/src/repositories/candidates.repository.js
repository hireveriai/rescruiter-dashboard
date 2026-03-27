const db = require("../config/db");

const candidateDashboardSelect = `
  SELECT
    c.id,
    c.first_name AS "firstName",
    c.last_name AS "lastName",
    TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))) AS name,
    c.email,
    c.phone,
    c.status AS "candidateStatus",
    c.created_at AS "createdAt",
    c.updated_at AS "updatedAt",
    interview_data.id AS "interviewId",
    interview_data.status AS "interviewStatus",
    interview_data.scheduled_at AS "scheduledAt",
    interview_data.job_id AS "jobId",
    interview_data.job_title AS "jobTitle",
    interview_data.department,
    invite_data.id AS "inviteId",
    invite_data.token,
    invite_data.status AS "inviteStatus",
    invite_data.expires_at AS "expiresAt",
    invite_data.attempts_used AS "attemptsUsed",
    fraud_data.risk_level AS "riskLevel",
    fraud_data.fraudSignalCount,
    fraud_data.latestFraudAt,
    summary_data.summary_id AS "summaryId",
    summary_data.confidence_score AS "confidenceScore",
    summary_data.recommendation,
    summary_data.summary AS "verisSummary"
  FROM candidates c
  LEFT JOIN LATERAL (
    SELECT
      i.id,
      i.status,
      i.scheduled_at,
      jp.id AS job_id,
      jp.title AS job_title,
      jp.department
    FROM interviews i
    LEFT JOIN job_positions jp ON jp.id = i.job_position_id
    WHERE i.candidate_id = c.id
    ORDER BY i.created_at DESC NULLS LAST, i.id DESC
    LIMIT 1
  ) interview_data ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      ii.id,
      ii.token,
      ii.status,
      ii.expires_at,
      ii.attempts_used
    FROM interview_invites ii
    WHERE ii.interview_id = interview_data.id
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
      COUNT(*)::int AS "fraudSignalCount",
      MAX(fs.created_at) AS "latestFraudAt"
    FROM fraud_signals fs
    WHERE fs.candidate_id = c.id
  ) fraud_data ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      s.id AS summary_id,
      s.summary,
      s.risk_level,
      s.recommendation,
      s.confidence_score
    FROM interview_summaries s
    WHERE s.candidate_id = c.id
    ORDER BY s.created_at DESC NULLS LAST, s.id DESC
    LIMIT 1
  ) summary_data ON TRUE
`;

async function findAllCandidatesDashboard() {
  const query = `
    ${candidateDashboardSelect}
    ORDER BY c.created_at DESC NULLS LAST, c.id DESC
  `;

  const result = await db.query(query, []);
  return result.rows;
}

async function findCandidateDashboardById(candidateId) {
  const query = `
    ${candidateDashboardSelect}
    WHERE c.id = $1
    LIMIT 1
  `;

  const result = await db.query(query, [candidateId]);
  return result.rows[0] || null;
}

module.exports = {
  findAllCandidatesDashboard,
  findCandidateDashboardById,
};
