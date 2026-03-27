const interviewInviteService = require("../services/interview-invite.service");

async function createInterviewLink(req, res, next) {
  try {
    const invite = await interviewInviteService.createInterviewLink(req.body);

    res.status(201).json({
      success: true,
      data: invite,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createInterviewLink,
};
