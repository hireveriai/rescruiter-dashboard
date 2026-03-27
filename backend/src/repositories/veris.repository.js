const db = require("../config/db");

async function findLatestVerisByCandidateId(candidateId) {
  const query = `
    SELECT
      s.id,
      s.candidate_id AS "candidateId",
      s.interview_id AS "interviewId",
      s.summary,
      s.risk_level AS "riskLevel",
      s.recommendation,
      s.confidence_score AS "confidenceScore",
      s.created_at AS "createdAt",
      s.updated_at AS "updatedAt",
      TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))) AS "candidateName",
      i.status AS "interviewStatus",
      jp.title AS "jobTitle"
    FROM interview_summaries s
    INNER JOIN candidates c ON c.id = s.candidate_id
    LEFT JOIN interviews i ON i.id = s.interview_id
    LEFT JOIN job_positions jp ON jp.id = i.job_position_id
    WHERE s.candidate_id = $1
    ORDER BY s.created_at DESC NULLS LAST, s.id DESC
    LIMIT 1
  `;

  const result = await db.query(query, [candidateId]);
  return result.rows[0] || null;
}

module.exports = {
  findLatestVerisByCandidateId,
};
