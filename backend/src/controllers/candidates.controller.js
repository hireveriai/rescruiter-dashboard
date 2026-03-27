const candidatesService = require("../services/candidates.service");

async function getCandidates(req, res, next) {
  try {
    const candidates = await candidatesService.getCandidates();

    res.status(200).json({
      success: true,
      data: candidates,
    });
  } catch (error) {
    next(error);
  }
}

async function getCandidateById(req, res, next) {
  try {
    const candidate = await candidatesService.getCandidateById(req.params.id);

    res.status(200).json({
      success: true,
      data: candidate,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCandidates,
  getCandidateById,
};
