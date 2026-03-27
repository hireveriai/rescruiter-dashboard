const interviewService = require("../services/interview.service");

async function createInterviewLink(req, res, next) {
  try {
    const result = await interviewService.createInterviewLink(req.body);

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createInterviewLink,
};
