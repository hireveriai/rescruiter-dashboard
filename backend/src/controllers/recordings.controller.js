const recordingsService = require("../services/recordings.service");

async function getRecordingsByInterviewId(req, res, next) {
  try {
    const recordings = await recordingsService.getRecordingsByInterviewId(req.params.interviewId);

    res.status(200).json({
      success: true,
      data: recordings,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getRecordingsByInterviewId,
};
