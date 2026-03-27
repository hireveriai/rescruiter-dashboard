const db = require("../config/db");

const baseSelect = `
  SELECT
    jp.job_id AS id,
    jp.organization_id AS "organizationId",
    org.organization_name AS "organizationName",
    jp.job_title AS title,
    jp.job_description AS description,
    jp.experience_level AS "experienceLevel",
    jp.core_skills AS "coreSkills",
    jp.difficulty_profile AS "difficultyProfile",
    jp.is_active AS "isActive",
    CASE WHEN jp.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
    jp.created_at AS "createdAt",
    NULL::timestamptz AS "updatedAt"
  FROM job_positions jp
  LEFT JOIN organizations org ON org.organization_id = jp.organization_id
`;

async function createJob(job) {
  const query = `
    INSERT INTO job_positions (
      organization_id,
      job_title,
      job_description,
      experience_level,
      core_skills,
      difficulty_profile,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING
      job_id AS id,
      organization_id AS "organizationId",
      job_title AS title,
      job_description AS description,
      experience_level AS "experienceLevel",
      core_skills AS "coreSkills",
      difficulty_profile AS "difficultyProfile",
      is_active AS "isActive",
      CASE WHEN is_active THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
      created_at AS "createdAt",
      NULL::timestamptz AS "updatedAt"
  `;

  const values = [
    job.organizationId,
    job.title,
    job.description,
    job.experienceLevel,
    job.coreSkills,
    job.difficultyProfile,
    job.isActive,
  ];

  const result = await db.query(query, values);
  return result.rows[0];
}

async function findAllJobs() {
  const query = `
    ${baseSelect}
    ORDER BY jp.created_at DESC, jp.job_id DESC
  `;

  const result = await db.query(query, []);
  return result.rows;
}

async function findJobById(jobId) {
  const query = `
    ${baseSelect}
    WHERE jp.job_id = $1
    LIMIT 1
  `;

  const result = await db.query(query, [jobId]);
  return result.rows[0] || null;
}

module.exports = {
  createJob,
  findAllJobs,
  findJobById,
};
