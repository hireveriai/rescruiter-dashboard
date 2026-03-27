const express = require("express");
const recordingsController = require("../controllers/recordings.controller");

const router = express.Router();

router.get("/:interviewId", recordingsController.getRecordingsByInterviewId);

module.exports = router;
