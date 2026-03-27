const ApiError = require("../utils/api-error");
const verisRepository = require("../repositories/veris.repository");
const dashboardService = require("./dashboard.service");

function parseId(candidateId) {
  const parsedId = Number(candidateId);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new ApiError(400, "candidate id must be a positive integer");
  }

  return parsedId;
}

async function getVerisByCandidateId(candidateId) {
  const parsedId = parseId(candidateId);
  const summary = await verisRepository.findLatestVerisByCandidateId(parsedId);

  if (!summary) {
    throw new ApiError(404, "VERIS summary not found");
  }

  return {
    ...summary,
    riskLevel: dashboardService.normalizeRiskLevel(summary.riskLevel),
  };
}

module.exports = {
  getVerisByCandidateId,
};
