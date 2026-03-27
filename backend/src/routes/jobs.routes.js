const express = require("express");
const jobsController = require("../controllers/jobs.controller");

const router = express.Router();

router.post("/", jobsController.createJob);
router.get("/", jobsController.getJobs);
router.get("/:id", jobsController.getJobById);

module.exports = router;
