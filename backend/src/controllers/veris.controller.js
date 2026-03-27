const verisService = require("../services/veris.service");

async function getVerisByCandidateId(req, res, next) {
  try {
    const summary = await verisService.getVerisByCandidateId(req.params.candidateId);

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getVerisByCandidateId,
};
