const jobsService = require("../services/jobs.service");

async function createJob(req, res, next) {
  try {
    const job = await jobsService.createJob(req.body);

    res.status(201).json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
}

async function getJobs(_req, res, next) {
  try {
    const jobs = await jobsService.getJobs();

    res.status(200).json({
      success: true,
      data: jobs,
    });
  } catch (error) {
    next(error);
  }
}

async function getJobById(req, res, next) {
  try {
    const job = await jobsService.getJobById(req.params.id);

    res.status(200).json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createJob,
  getJobs,
  getJobById,
};
