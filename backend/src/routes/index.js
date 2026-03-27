const express = require("express");
const jobsRoutes = require("./jobs.routes");
const interviewRoutes = require("./interview.routes");
const candidatesRoutes = require("./candidates.routes");
const interviewsRoutes = require("./interviews.routes");
const alertsRoutes = require("./alerts.routes");
const recordingsRoutes = require("./recordings.routes");
const verisRoutes = require("./veris.routes");

const router = express.Router();

router.use("/jobs", jobsRoutes);
router.use("/interview", interviewRoutes);
router.use("/candidates", candidatesRoutes);
router.use("/interviews", interviewsRoutes);
router.use("/alerts", alertsRoutes);
router.use("/recordings", recordingsRoutes);
router.use("/veris", verisRoutes);

module.exports = router;
