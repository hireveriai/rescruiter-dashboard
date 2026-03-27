const ApiError = require("../utils/api-error");
const recordingsRepository = require("../repositories/recordings.repository");

function parseId(interviewId) {
  const parsedId = Number(interviewId);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    throw new ApiError(400, "interview id must be a positive integer");
  }

  return parsedId;
}

async function getRecordingsByInterviewId(interviewId) {
  const parsedId = parseId(interviewId);
  return recordingsRepository.findRecordingsByInterviewId(parsedId);
}

module.exports = {
  getRecordingsByInterviewId,
};
