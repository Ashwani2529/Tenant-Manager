const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

router.get("/health", (_req, res) => {
  const database = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.status(database === "connected" ? 200 : 503).json({ status: "ok", database, time: new Date().toISOString() });
});

module.exports = router;

