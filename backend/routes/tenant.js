const express = require("express");
const {
  Tenant,
  Payment,
  MeterReading,
  AuditLog,
  Notification,
} = require("../models");
const { authenticate, requireRole } = require("../middleware/auth");
const {
  financialSummaryForTenant,
  ledgerForTenant,
  ensureMonthEndNotification,
} = require("../services/billing");

const router = express.Router();
router.use(authenticate, requireRole("tenant"));

function selectedTenantId(req) {
  const allowed = (req.user.tenants || []).map(String);
  const requested = String(req.query.tenant || req.get("x-tenant-id") || allowed[0] || "");
  if (!requested || !allowed.includes(requested)) {
    throw Object.assign(new Error("You do not have access to that tenant profile"), { status: 403 });
  }
  return requested;
}

async function currentTenant(req) {
  return Tenant.findById(selectedTenantId(req)).populate("room", "name type monthlyRent rentHistory");
}

router.get("/dashboard", async (req, res, next) => {
  try {
    const tenant = await currentTenant(req);
    if (!tenant) return res.status(404).json({ message: "Tenant profile not found" });
    await ensureMonthEndNotification(tenant._id);
    const [summary, latestPayment, latestReading, unreadNotifications] = await Promise.all([
      financialSummaryForTenant(tenant),
      Payment.findOne({ tenant: tenant._id }).sort({ paidAt: -1 }),
      MeterReading.findOne({ room: tenant.room._id }).sort({ readAt: -1 }),
      Notification.countDocuments({ tenant: tenant._id, readAt: null }),
    ]);
    res.json({
      tenant,
      balance: summary.balance,
      categories: summary.categories,
      liveRent: summary.liveRent,
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
    res.json(await ledgerForTenant(selectedTenantId(req)));
  } catch (error) {
    next(error);
  }
});

router.get("/payments", async (req, res, next) => {
  try {
    res.json(await Payment.find({ tenant: selectedTenantId(req) }).sort({ paidAt: -1 }).limit(300));
  } catch (error) {
    next(error);
  }
});

router.get("/meter-readings", async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(selectedTenantId(req)).select("room");
    if (!tenant) return res.status(404).json({ message: "Tenant profile not found" });
    res.json(await MeterReading.find({ room: tenant.room }).sort({ readAt: -1 }).limit(300).populate("room", "name"));
  } catch (error) {
    next(error);
  }
});

router.get("/audit-logs", async (req, res, next) => {
  try {
    res.json(await AuditLog.find({ tenant: selectedTenantId(req) }).sort({ createdAt: -1 }).limit(300).populate("actor", "name"));
  } catch (error) {
    next(error);
  }
});

router.get("/notifications", async (req, res, next) => {
  try {
    const tenantId = selectedTenantId(req);
    await ensureMonthEndNotification(tenantId);
    res.json(await Notification.find({ tenant: tenantId }).sort({ createdAt: -1 }).limit(100));
  } catch (error) {
    next(error);
  }
});

router.patch("/notifications/:id/read", async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, tenant: selectedTenantId(req) },
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

