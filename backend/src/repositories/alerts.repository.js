const db = require("../config/db");

async function findAllAlerts() {
  const query = `
    SELECT
      fs.id,
      fs.interview_id AS "interviewId",
      fs.candidate_id AS "candidateId",
      fs.signal_type AS "signalType",
      fs.severity,
      fs.status,
      fs.description,
      fs.created_at AS "createdAt",
      TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))) AS "candidateName",
      c.email AS "candidateEmail",
      i.status AS "interviewStatus",
      jp.id AS "jobId",
      jp.title AS "jobTitle"
    FROM fraud_signals fs
    LEFT JOIN candidates c ON c.id = fs.candidate_id
    LEFT JOIN interviews i ON i.id = fs.interview_id
    LEFT JOIN job_positions jp ON jp.id = i.job_position_id
    ORDER BY fs.created_at DESC NULLS LAST, fs.id DESC
  `;

  const result = await db.query(query, []);
  return result.rows;
}

module.exports = {
  findAllAlerts,
};
