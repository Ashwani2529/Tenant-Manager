const express = require("express");
const {
  Tenant,
  LedgerEntry,
  Payment,
  MeterReading,
  AuditLog,
  Notification,
} = require("../models");
const { authenticate, requireRole } = require("../middleware/auth");
const { money } = require("../services/billing");

const router = express.Router();
router.use(authenticate, requireRole("tenant"));

async function currentTenant(req) {
  return Tenant.findById(req.user.tenant).populate("room", "name type monthlyRent");
}

router.get("/dashboard", async (req, res, next) => {
  try {
    const tenant = await currentTenant(req);
    if (!tenant) return res.status(404).json({ message: "Tenant profile not found" });
    const [totals, latestPayment, latestReading, unreadNotifications] = await Promise.all([
      LedgerEntry.aggregate([
        { $match: { tenant: tenant._id } },
        { $group: { _id: "$category", amount: { $sum: "$amount" } } },
      ]),
      Payment.findOne({ tenant: tenant._id }).sort({ paidAt: -1 }),
      MeterReading.findOne({ room: tenant.room._id }).sort({ readAt: -1 }),
      Notification.countDocuments({ tenant: tenant._id, readAt: null }),
    ]);
    const categories = Object.fromEntries(totals.map((item) => [item._id, money(item.amount)]));
    res.json({
      tenant,
      balance: money(Object.values(categories).reduce((sum, value) => sum + value, 0)),
      categories,
      latestPayment,
      latestReading,
      unreadNotifications,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/ledger", async (req, res, next) => {
  try {
    res.json(await LedgerEntry.find({ tenant: req.user.tenant }).sort({ effectiveAt: -1, createdAt: -1 }).limit(500).populate("room", "name"));
  } catch (error) {
    next(error);
  }
});

router.get("/payments", async (req, res, next) => {
  try {
    res.json(await Payment.find({ tenant: req.user.tenant }).sort({ paidAt: -1 }).limit(300));
  } catch (error) {
    next(error);
  }
});

router.get("/meter-readings", async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.user.tenant).select("room");
    res.json(await MeterReading.find({ room: tenant.room }).sort({ readAt: -1 }).limit(300).populate("room", "name"));
  } catch (error) {
    next(error);
  }
});

router.get("/audit-logs", async (req, res, next) => {
  try {
    res.json(await AuditLog.find({ tenant: req.user.tenant }).sort({ createdAt: -1 }).limit(300).populate("actor", "name"));
  } catch (error) {
    next(error);
  }
});

router.get("/notifications", async (req, res, next) => {
  try {
    res.json(await Notification.find({ tenant: req.user.tenant }).sort({ createdAt: -1 }).limit(100));
  } catch (error) {
    next(error);
  }
});

router.patch("/notifications/:id/read", async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, tenant: req.user.tenant },
      { readAt: new Date() },
      { new: true },
    );
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json(notification);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

