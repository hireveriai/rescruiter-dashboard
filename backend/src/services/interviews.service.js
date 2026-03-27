const ApiError = require("../utils/api-error");
const interviewsRepository = require("../repositories/interviews.repository");
const dashboardService = require("./dashboard.service");

function parseId(interviewId) {
  const parsedId = Number(interviewId);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new ApiError(400, "interview id must be a positive integer");
  }

  return parsedId;
}

async function getInterviews() {
  const rows = await interviewsRepository.findAllInterviewsDashboard();
  return rows.map(dashboardService.mapInterviewDashboard);
}

async function getInterviewById(interviewId) {
  const parsedId = parseId(interviewId);
  const row = await interviewsRepository.findInterviewDashboardById(parsedId);

  if (!row) {
    throw new ApiError(404, "interview not found");
  }

  return dashboardService.mapInterviewDashboard(row);
}

module.exports = {
  getInterviews,
  getInterviewById,
};
