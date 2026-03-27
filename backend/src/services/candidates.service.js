const ApiError = require("../utils/api-error");
const candidatesRepository = require("../repositories/candidates.repository");
const dashboardService = require("./dashboard.service");

function parseId(candidateId) {
  const parsedId = Number(candidateId);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new ApiError(400, "candidate id must be a positive integer");
  }

  return parsedId;
}

async function getCandidates() {
  const rows = await candidatesRepository.findAllCandidatesDashboard();
  return rows.map(dashboardService.mapCandidateDashboard);
}

async function getCandidateById(candidateId) {
  const parsedId = parseId(candidateId);
  const row = await candidatesRepository.findCandidateDashboardById(parsedId);

  if (!row) {
    throw new ApiError(404, "candidate not found");
  }

  return dashboardService.mapCandidateDashboard(row);
}

module.exports = {
  getCandidates,
  getCandidateById,
};
