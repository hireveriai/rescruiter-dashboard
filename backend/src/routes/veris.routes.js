const express = require("express");
const verisController = require("../controllers/veris.controller");

const router = express.Router();

router.get("/:candidateId", verisController.getVerisByCandidateId);

module.exports = router;
