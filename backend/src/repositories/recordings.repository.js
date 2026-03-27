const db = require("../config/db");

async function findRecordingsByInterviewId(interviewId) {
  const query = `
    SELECT
      ir.id,
      ir.interview_id AS "interviewId",
      ir.recording_url AS "recordingUrl",
      ir.duration_seconds AS "durationSeconds",
      ir.created_at AS "createdAt",
      i.status AS "interviewStatus",
      TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))) AS "candidateName",
      jp.title AS "jobTitle"
    FROM interview_recordings ir
    INNER JOIN interviews i ON i.id = ir.interview_id
    LEFT JOIN candidates c ON c.id = i.candidate_id
    LEFT JOIN job_positions jp ON jp.id = i.job_position_id
    WHERE ir.interview_id = $1
    ORDER BY ir.created_at DESC NULLS LAST, ir.id DESC
  `;

  const result = await db.query(query, [interviewId]);
  return result.rows;
}

module.exports = {
  findRecordingsByInterviewId,
};
