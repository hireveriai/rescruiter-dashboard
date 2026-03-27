const ApiError = require("../utils/api-error");
const jobsRepository = require("../repositories/jobs.repository");

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedDifficultyProfiles = new Set(["JUNIOR", "MID", "SENIOR"]);
const activeStatuses = new Set(["ACTIVE", "OPEN"]);
const inactiveStatuses = new Set(["INACTIVE", "CLOSED", "ARCHIVED"]);

function isUuid(value) {
  return uuidPattern.test(String(value || "").trim());
}

function normalizeCoreSkills(coreSkills) {
  if (coreSkills === undefined || coreSkills === null) {
    return null;
  }

  if (Array.isArray(coreSkills)) {
    return coreSkills
      .map((skill) => String(skill).trim())
      .filter(Boolean);
  }

  if (typeof coreSkills === "string") {
    return coreSkills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
  }

  throw new ApiError(400, "coreSkills must be an array of strings or a comma-separated string");
}

function normalizeIsActive(status, isActive) {
  if (typeof isActive === "boolean") {
    return isActive;
  }

  if (status === undefined || status === null || status === "") {
    return true;
  }

  const normalizedStatus = String(status).trim().toUpperCase();

  if (activeStatuses.has(normalizedStatus)) {
    return true;
  }

  if (inactiveStatuses.has(normalizedStatus)) {
    return false;
  }

  throw new ApiError(400, "status must be one of: ACTIVE, OPEN, INACTIVE, CLOSED, ARCHIVED");
}

function normalizeDifficultyProfile(difficultyProfile) {
  if (difficultyProfile === undefined || difficultyProfile === null || difficultyProfile === "") {
    return "MID";
  }

  const normalizedDifficultyProfile = String(difficultyProfile).trim().toUpperCase();

  if (!allowedDifficultyProfiles.has(normalizedDifficultyProfile)) {
    throw new ApiError(400, "difficultyProfile must be one of: JUNIOR, MID, SENIOR");
  }

  return normalizedDifficultyProfile;
}

function normalizeJobPayload(payload) {
  const organizationId = String(payload.organizationId || "").trim();
  const title = String(payload.title || "").trim();
  const description = payload.description ? String(payload.description).trim() : null;
  const experienceLevel = payload.experienceLevel
    ? String(payload.experienceLevel).trim()
    : null;
  const coreSkills = normalizeCoreSkills(payload.coreSkills);
  const difficultyProfile = normalizeDifficultyProfile(payload.difficultyProfile);
  const isActive = normalizeIsActive(payload.status, payload.isActive);

  if (!isUuid(organizationId)) {
    throw new ApiError(400, "organizationId is required and must be a valid UUID");
  }

  if (!title) {
    throw new ApiError(400, "title is required");
  }

  return {
    organizationId,
    title,
    description,
    experienceLevel,
    coreSkills,
    difficultyProfile,
    isActive,
  };
}

async function createJob(payload) {
  const normalizedJob = normalizeJobPayload(payload);
  return jobsRepository.createJob(normalizedJob);
}

async function getJobs() {
  return jobsRepository.findAllJobs();
}

async function getJobById(jobId) {
  if (!isUuid(jobId)) {
    throw new ApiError(400, "job id must be a valid UUID");
  }

  const job = await jobsRepository.findJobById(jobId);

  if (!job) {
    throw new ApiError(404, "job not found");
  }

  return job;
}

module.exports = {
  createJob,
  getJobs,
  getJobById,
};
