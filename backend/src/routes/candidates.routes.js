const express = require("express");
const candidatesController = require("../controllers/candidates.controller");

const router = express.Router();

router.get("/", candidatesController.getCandidates);
router.get("/:id", candidatesController.getCandidateById);

module.exports = router;
