const express = require("express");
const interviewController = require("../controllers/interview.controller");

const router = express.Router();

router.post("/create-link", interviewController.createInterviewLink);

module.exports = router;
