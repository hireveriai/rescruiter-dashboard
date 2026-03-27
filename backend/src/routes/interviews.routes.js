const express = require("express");
const interviewsController = require("../controllers/interviews.controller");

const router = express.Router();

router.get("/", interviewsController.getInterviews);
router.get("/:id", interviewsController.getInterviewById);

module.exports = router;
