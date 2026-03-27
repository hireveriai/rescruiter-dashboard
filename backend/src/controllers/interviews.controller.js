const interviewsService = require("../services/interviews.service");

async function getInterviews(req, res, next) {
  try {
    const interviews = await interviewsService.getInterviews();

    res.status(200).json({
      success: true,
      data: interviews,
    });
  } catch (error) {
    next(error);
  }
}

async function getInterviewById(req, res, next) {
  try {
    const interview = await interviewsService.getInterviewById(req.params.id);

    res.status(200).json({
      success: true,
      data: interview,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getInterviews,
  getInterviewById,
};
