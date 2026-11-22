const express = require("express");
const mongoose = require("mongoose");
const { runDailyBilling } = require("../services/billing");

const router = express.Router();

function authorizeCron(req, res, next) {
  if (!process.env.CRON_SECRET) return res.status(503).json({ message: "CRON_SECRET is not configured" });
  if (req.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return res.status(401).json({ message: "Invalid cron secret" });
  }
  next();
}

router.get("/health", (_req, res) => {
  const database = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
  res.status(database === "connected" ? 200 : 503).json({ status: "ok", database, time: new Date().toISOString() });
});

router.post("/wake", authorizeCron, (_req, res) => {
  res.json({ status: "awake", time: new Date().toISOString() });
});

router.post("/daily", authorizeCron, async (_req, res, next) => {
  try {
    res.json({ status: "completed", ...(await runDailyBilling()) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

