const express = require("express");
const {
  User,
  Room,
  Tenant,
  Configuration,
  LedgerEntry,
  Payment,
  MeterReading,
  AuditLog,
  Notification,
} = require("../models");
const { authenticate, requireRole } = require("../middleware/auth");
const { hashPassword, normalizePhone, isValidPhone } = require("../utils/security");
const { dateKeyIST, istDateKeyToDate } = require("../utils/time");
const {
  money,
  dailyRentAmount,
  balanceForTenant,
  advancePaidThrough,
  runDailyBilling,
} = require("../services/billing");

const router = express.Router();
router.use(authenticate, requireRole("admin"));

function objectChanges(before, after, fields) {
  return Object.fromEntries(
    fields
      .filter((field) => String(before[field] ?? "") !== String(after[field] ?? ""))
      .map((field) => [field, { from: before[field] ?? null, to: after[field] ?? null }]),
  );
}

function requireReason(req, res) {
  const reason = String(req.body.reason || "").trim();
  if (reason.length < 3) {
    res.status(400).json({ message: "Please provide a reason for this change" });
    return null;
  }
  return reason;
}

async function audit({ actor, tenant = null, entityType, entityId, action, reason, changes = {} }) {
  return AuditLog.create({ actor, tenant, entityType, entityId, action, reason, changes });
}

function dateInput(value, fallback = new Date()) {
  if (!value) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return istDateKeyToDate(value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date");
  return parsed;
}

async function config() {
  return Configuration.findOneAndUpdate(
    { key: "primary" },
    { $setOnInsert: { key: "primary", propertyName: "Homely Tenants" } },
    { new: true, upsert: true },
  );
}

async function recordMeterReading({ roomId, units, readAt, isOpening, actor }) {
  const room = await Room.findById(roomId);
  if (!room || !room.active) throw Object.assign(new Error("Room not found"), { status: 404 });

  const currentUnits = Number(units);
  if (!Number.isFinite(currentUnits) || currentUnits < 0) {
    throw Object.assign(new Error("Enter a valid meter reading"), { status: 400 });
  }

  const when = dateInput(readAt);
  const previous = await MeterReading.findOne({ room: room._id }).sort({ readAt: -1 });
  if (previous && currentUnits < previous.units) {
    throw Object.assign(new Error(`Current units cannot be below the previous reading (${previous.units})`), { status: 400 });
  }

  const opening = Boolean(isOpening || !previous);
  const consumedUnits = opening ? 0 : currentUnits - previous.units;
  const settings = await config();
  const totalCharge = money(consumedUnits * settings.electricityPrice);
  const reading = await MeterReading.create({
    room: room._id,
    units: currentUnits,
    previousUnits: previous?.units ?? null,
    consumedUnits,
    rate: settings.electricityPrice,
    totalCharge,
    readAt: when,
    isOpening: opening,
    createdBy: actor,
  });

  if (!opening && consumedUnits > 0) {
    const tenants = await Tenant.find({ room: room._id, status: "active" }).sort({ createdAt: 1 });
    const expected = room.type === "double" ? 2 : 1;
    if (tenants.length !== expected) {
      await MeterReading.findByIdAndDelete(reading._id);
      throw Object.assign(new Error(`${room.name} must have exactly ${expected} active tenant${expected > 1 ? "s" : ""} before billing electricity`), { status: 400 });
    }

    const totalPaise = Math.round(totalCharge * 100);
    const basePaise = Math.floor(totalPaise / tenants.length);
    let remainder = totalPaise % tenants.length;
    for (const tenant of tenants) {
      const sharePaise = basePaise + (remainder-- > 0 ? 1 : 0);
      await LedgerEntry.create({
        tenant: tenant._id,
        room: room._id,
        kind: "charge",
        category: "electricity",
        amount: sharePaise / 100,
        description: `${consumedUnits} units for ${room.name}${tenants.length > 1 ? " (shared)" : ""}`,
        effectiveAt: when,
        source: "admin",
        uniqueKey: `electricity:${reading._id}:${tenant._id}`,
        metadata: { reading: reading._id, previousUnits: previous.units, currentUnits, rate: settings.electricityPrice },
        createdBy: actor,
      });
      await Notification.create({
        tenant: tenant._id,
        type: "electricity",
        title: "Electricity bill updated",
        message: `${consumedUnits} units were recorded for ${room.name}. Your share is ₹${(sharePaise / 100).toFixed(2)}.`,
        uniqueKey: `electricity-notification:${reading._id}:${tenant._id}`,
      });
      await audit({
        actor,
        tenant: tenant._id,
        entityType: "meter_reading",
        entityId: reading._id,
        action: "created",
        reason: "Electricity meter reading recorded",
        changes: { previousUnits: previous.units, currentUnits, consumedUnits, rate: settings.electricityPrice },
      });
    }
  }
  return reading.populate("room", "name type");
}

router.get("/dashboard", async (_req, res, next) => {
  try {
    const [activeTenants, activeRooms, balances, recentPayments, recentReadings] = await Promise.all([
      Tenant.countDocuments({ status: "active" }),
      Room.countDocuments({ active: true }),
      LedgerEntry.aggregate([
        { $group: { _id: "$tenant", balance: { $sum: "$amount" } } },
        { $match: { balance: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: "$balance" } } },
      ]),
      Payment.find().sort({ paidAt: -1 }).limit(5).populate("tenant", "name phone"),
      MeterReading.find().sort({ readAt: -1 }).limit(5).populate("room", "name"),
    ]);
    res.json({
      activeTenants,
      activeRooms,
      totalDue: money(Math.max(0, balances[0]?.total || 0)),
      recentPayments,
      recentReadings,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/rooms", async (_req, res, next) => {
  try {
    const rooms = await Room.find().sort({ active: -1, name: 1 }).lean();
    const counts = await Tenant.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$room", count: { $sum: 1 } } },
    ]);
    const byRoom = new Map(counts.map((item) => [String(item._id), item.count]));
    res.json(rooms.map((room) => ({ ...room, occupants: byRoom.get(String(room._id)) || 0 })));
  } catch (error) {
    next(error);
  }
});

router.post("/rooms", async (req, res, next) => {
  try {
    const amount = Number(req.body.monthlyRent);
    if (!req.body.name?.trim() || !["single", "double"].includes(req.body.type) || !(amount > 0)) {
      return res.status(400).json({ message: "Room name, type and monthly rent are required" });
    }
    const effectiveFrom = dateInput(req.body.effectiveFrom);
    const room = await Room.create({
      name: req.body.name.trim(),
      type: req.body.type,
      monthlyRent: amount,
      rentHistory: [{ amount, effectiveFrom }],
    });
    await audit({ actor: req.user._id, entityType: "room", entityId: room._id, action: "created", reason: "Room created", changes: { name: room.name, type: room.type, monthlyRent: room.monthlyRent } });
    res.status(201).json(room);
  } catch (error) {
    next(error);
  }
});

router.patch("/rooms/:id", async (req, res, next) => {
  try {
    const reason = requireReason(req, res);
    if (!reason) return;
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });
    const before = room.toObject();
    if (req.body.name != null) room.name = String(req.body.name).trim();
    if (req.body.type != null) room.type = req.body.type;
    if (req.body.monthlyRent != null && Number(req.body.monthlyRent) !== room.monthlyRent) {
      room.monthlyRent = Number(req.body.monthlyRent);
      room.rentHistory.push({ amount: room.monthlyRent, effectiveFrom: dateInput(req.body.effectiveFrom) });
    }
    await room.save();
    const changes = objectChanges(before, room, ["name", "type", "monthlyRent"]);
    const affectedTenants = await Tenant.find({ room: room._id, status: "active" }).select("_id");
    if (affectedTenants.length) {
      await Promise.all(affectedTenants.map((tenant) => audit({ actor: req.user._id, tenant: tenant._id, entityType: "room", entityId: room._id, action: "updated", reason, changes })));
    } else {
      await audit({ actor: req.user._id, entityType: "room", entityId: room._id, action: "updated", reason, changes });
    }
    res.json(room);
  } catch (error) {
    next(error);
  }
});

router.delete("/rooms/:id", async (req, res, next) => {
  try {
    const reason = requireReason(req, res);
    if (!reason) return;
    if (await Tenant.exists({ room: req.params.id, status: "active" })) {
      return res.status(409).json({ message: "Move out active tenants before archiving this room" });
    }
    const room = await Room.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    if (!room) return res.status(404).json({ message: "Room not found" });
    await audit({ actor: req.user._id, entityType: "room", entityId: room._id, action: "archived", reason, changes: { active: { from: true, to: false } } });
    res.json(room);
  } catch (error) {
    next(error);
  }
});

router.get("/tenants", async (_req, res, next) => {
  try {
    const tenants = await Tenant.find().sort({ status: 1, name: 1 }).populate("room", "name type monthlyRent").lean();
    const balances = await LedgerEntry.aggregate([{ $group: { _id: "$tenant", balance: { $sum: "$amount" } } }]);
    const byTenant = new Map(balances.map((item) => [String(item._id), money(item.balance)]));
    res.json(tenants.map((tenant) => ({ ...tenant, balance: byTenant.get(String(tenant._id)) || 0 })));
  } catch (error) {
    next(error);
  }
});

router.post("/tenants", async (req, res, next) => {
  let user;
  try {
    const phone = normalizePhone(req.body.phone);
    if (!req.body.name?.trim() || !isValidPhone(phone)) {
      return res.status(400).json({ message: "Name and a unique 10-digit phone number are required" });
    }
    const room = await Room.findOne({ _id: req.body.room, active: true });
    if (!room) return res.status(400).json({ message: "Select an active room" });
    const occupied = await Tenant.countDocuments({ room: room._id, status: "active" });
    const capacity = room.type === "double" ? 2 : 1;
    if (occupied >= capacity) return res.status(409).json({ message: `${room.name} is already full` });

    const joiningAt = dateInput(req.body.joiningAt);
    const billingStartAt = dateInput(req.body.billingStartAt, joiningAt);
    const paidThrough = dateInput(req.body.rentPaidThrough, joiningAt);
    user = await User.create({ role: "tenant", name: req.body.name.trim(), phone, passwordHash: await hashPassword(req.body.password) });
    const tenant = await Tenant.create({ user: user._id, room: room._id, name: user.name, phone, joiningAt, billingStartAt, rentPaidThrough: paidThrough });
    user.tenant = tenant._id;
    await user.save();

    const openingBalance = Number(req.body.openingBalance || 0);
    if (openingBalance !== 0) {
      await LedgerEntry.create({ tenant: tenant._id, room: room._id, kind: "opening", category: "general", amount: money(openingBalance), description: "Opening balance", effectiveAt: billingStartAt, source: "admin", createdBy: req.user._id });
    }
    await audit({ actor: req.user._id, tenant: tenant._id, entityType: "tenant", entityId: tenant._id, action: "created", reason: "Tenant account created", changes: { name: tenant.name, phone, room: room.name, joiningAt } });
    res.status(201).json(await tenant.populate("room", "name type monthlyRent"));
  } catch (error) {
    if (user?._id && !(await Tenant.exists({ user: user._id }))) await User.findByIdAndDelete(user._id).catch(() => {});
    next(error);
  }
});

router.patch("/tenants/:id", async (req, res, next) => {
  try {
    const reason = requireReason(req, res);
    if (!reason) return;
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    const user = await User.findById(tenant.user);
    const before = tenant.toObject();
    if (req.body.name != null) tenant.name = user.name = String(req.body.name).trim();
    if (req.body.phone != null) {
      const phone = normalizePhone(req.body.phone);
      if (!isValidPhone(phone)) return res.status(400).json({ message: "Enter a valid 10-digit phone number" });
      tenant.phone = user.phone = phone;
    }
    for (const field of ["joiningAt", "billingStartAt", "rentPaidThrough"]) {
      if (req.body[field] != null) tenant[field] = dateInput(req.body[field]);
    }
    await Promise.all([tenant.save(), user.save()]);
    await audit({ actor: req.user._id, tenant: tenant._id, entityType: "tenant", entityId: tenant._id, action: "updated", reason, changes: objectChanges(before, tenant, ["name", "phone", "joiningAt", "billingStartAt", "rentPaidThrough"]) });
    res.json(await tenant.populate("room", "name type monthlyRent"));
  } catch (error) {
    next(error);
  }
});

router.post("/tenants/:id/reset-password", async (req, res, next) => {
  try {
    const reason = requireReason(req, res);
    if (!reason) return;
    const tenant = await Tenant.findById(req.params.id);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    await User.findByIdAndUpdate(tenant.user, { passwordHash: await hashPassword(req.body.password) });
    await audit({ actor: req.user._id, tenant: tenant._id, entityType: "tenant", entityId: tenant._id, action: "password_reset", reason, changes: { password: "Reset securely" } });
    res.json({ message: "Password reset successfully. Share the new password with the tenant now." });
  } catch (error) {
    next(error);
  }
});

router.post("/tenants/:id/archive", async (req, res, next) => {
  try {
    const reason = requireReason(req, res);
    if (!reason) return;
    const tenant = await Tenant.findById(req.params.id).populate("room");
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    const moveOutKey = String(req.body.moveOutDate || dateKeyIST()).slice(0, 10);
    const moveOutAt = istDateKeyToDate(moveOutKey, "12:00:00.000");
    const fullCharge = await LedgerEntry.findOne({ uniqueKey: `rent:${tenant._id}:${moveOutKey}` });
    if (fullCharge && !fullCharge.metadata?.halfDay) {
      const halfAmount = dailyRentAmount(tenant.room, moveOutKey, true);
      const correction = money(halfAmount - fullCharge.amount);
      await LedgerEntry.create({ tenant: tenant._id, room: tenant.room._id, kind: "adjustment", category: "rent", amount: correction, description: `Half-day move-out correction for ${moveOutKey}`, effectiveAt: moveOutAt, source: "admin", uniqueKey: `moveout:${tenant._id}:${moveOutKey}`, createdBy: req.user._id, metadata: { reason } });
    }
    tenant.status = "moved_out";
    tenant.moveOutAt = moveOutAt;
    await tenant.save();
    await User.findByIdAndUpdate(tenant.user, { active: false });
    await audit({ actor: req.user._id, tenant: tenant._id, entityType: "tenant", entityId: tenant._id, action: "archived", reason, changes: { status: { from: "active", to: "moved_out" }, moveOutAt } });
    res.json(tenant);
  } catch (error) {
    next(error);
  }
});

router.get("/ledger", async (req, res, next) => {
  try {
    const query = req.query.tenant ? { tenant: req.query.tenant } : {};
    res.json(await LedgerEntry.find(query).sort({ effectiveAt: -1, createdAt: -1 }).limit(500).populate("tenant", "name phone").populate("room", "name"));
  } catch (error) {
    next(error);
  }
});

router.post("/adjustments", async (req, res, next) => {
  try {
    const reason = requireReason(req, res);
    if (!reason) return;
    const tenant = await Tenant.findById(req.body.tenant);
    const amount = Number(req.body.amount);
    if (!tenant || !Number.isFinite(amount) || amount === 0) return res.status(400).json({ message: "Tenant and a non-zero adjustment are required" });
    const entry = await LedgerEntry.create({ tenant: tenant._id, room: tenant.room, kind: "adjustment", category: req.body.category || "general", amount: money(amount), description: req.body.description || reason, effectiveAt: dateInput(req.body.effectiveAt), source: "admin", createdBy: req.user._id, metadata: { reason } });
    await audit({ actor: req.user._id, tenant: tenant._id, entityType: "ledger", entityId: entry._id, action: "adjusted", reason, changes: { amount: entry.amount, category: entry.category } });
    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
});

router.get("/payments", async (req, res, next) => {
  try {
    const query = req.query.tenant ? { tenant: req.query.tenant } : {};
    res.json(await Payment.find(query).sort({ paidAt: -1 }).populate("tenant", "name phone").limit(300));
  } catch (error) {
    next(error);
  }
});

router.post("/payments", async (req, res, next) => {
  try {
    const tenant = await Tenant.findById(req.body.tenant).populate("room");
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    const rentAmount = money(Number(req.body.rentAmount || 0));
    const electricityAmount = money(Number(req.body.electricityAmount || 0));
    const totalAmount = money(rentAmount + electricityAmount);
    if (!(totalAmount > 0)) return res.status(400).json({ message: "Allocate an amount to rent or electricity" });
    const paidAt = dateInput(req.body.paidAt);
    const payment = await Payment.create({ tenant: tenant._id, totalAmount, rentAmount, electricityAmount, paidAt, note: req.body.note, createdBy: req.user._id });
    if (rentAmount > 0) {
      await LedgerEntry.create({ tenant: tenant._id, room: tenant.room._id, kind: "payment", category: "rent", amount: -rentAmount, description: "Rent payment received", effectiveAt: paidAt, source: "admin", uniqueKey: `payment:${payment._id}:rent`, createdBy: req.user._id });
      tenant.rentPaidThrough = await advancePaidThrough(tenant, tenant.room, rentAmount);
      await tenant.save();
    }
    if (electricityAmount > 0) {
      await LedgerEntry.create({ tenant: tenant._id, room: tenant.room._id, kind: "payment", category: "electricity", amount: -electricityAmount, description: "Electricity payment received", effectiveAt: paidAt, source: "admin", uniqueKey: `payment:${payment._id}:electricity`, createdBy: req.user._id });
    }
    await Notification.create({ tenant: tenant._id, type: "payment", title: "Payment received", message: `We recorded your payment of ₹${totalAmount.toFixed(2)}. Thank you.`, uniqueKey: `payment-notification:${payment._id}` });
    await audit({ actor: req.user._id, tenant: tenant._id, entityType: "payment", entityId: payment._id, action: "created", reason: req.body.note || "Payment received", changes: { totalAmount, rentAmount, electricityAmount, rentPaidThrough: tenant.rentPaidThrough } });
    res.status(201).json({ payment, rentPaidThrough: tenant.rentPaidThrough, balance: await balanceForTenant(tenant._id) });
  } catch (error) {
    next(error);
  }
});

router.get("/meter-readings", async (_req, res, next) => {
  try {
    res.json(await MeterReading.find().sort({ readAt: -1 }).populate("room", "name type").limit(300));
  } catch (error) {
    next(error);
  }
});

router.post("/meter-readings", async (req, res, next) => {
  try {
    res.status(201).json(await recordMeterReading({ roomId: req.body.room, units: req.body.units, readAt: req.body.readAt, isOpening: req.body.isOpening, actor: req.user._id }));
  } catch (error) {
    next(error);
  }
});

router.get("/configuration", async (_req, res, next) => {
  try {
    res.json(await config());
  } catch (error) {
    next(error);
  }
});

router.put("/configuration", async (req, res, next) => {
  try {
    const reason = requireReason(req, res);
    if (!reason) return;
    const settings = await config();
    const before = settings.toObject();
    const nextRate = Number(req.body.electricityPrice);
    if (Number.isFinite(nextRate) && nextRate !== settings.electricityPrice) {
      const occupiedRooms = await Tenant.distinct("room", { status: "active" });
      const readings = Array.isArray(req.body.currentReadings) ? req.body.currentReadings : [];
      if (settings.electricityPrice > 0 && occupiedRooms.length && occupiedRooms.some((roomId) => !readings.some((item) => String(item.room) === String(roomId)))) {
        return res.status(400).json({ message: "Enter a current meter reading for every occupied room before changing the unit price" });
      }
      for (const reading of readings) {
        await recordMeterReading({ roomId: reading.room, units: reading.units, readAt: req.body.effectiveFrom, isOpening: false, actor: req.user._id });
      }
      settings.electricityPrice = nextRate;
      settings.electricityPriceHistory.push({ price: nextRate, effectiveFrom: dateInput(req.body.effectiveFrom) });
    }
    if (req.body.propertyName != null) settings.propertyName = String(req.body.propertyName).trim();
    await settings.save();
    const changes = objectChanges(before, settings, ["propertyName", "electricityPrice"]);
    const affectedTenants = await Tenant.find({ status: "active" }).select("_id");
    if (affectedTenants.length) {
      await Promise.all(affectedTenants.map((tenant) => audit({ actor: req.user._id, tenant: tenant._id, entityType: "configuration", entityId: settings._id, action: "updated", reason, changes })));
    } else {
      await audit({ actor: req.user._id, entityType: "configuration", entityId: settings._id, action: "updated", reason, changes });
    }
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

router.get("/audit-logs", async (req, res, next) => {
  try {
    const query = req.query.tenant ? { tenant: req.query.tenant } : {};
    res.json(await AuditLog.find(query).sort({ createdAt: -1 }).limit(500).populate("actor", "name").populate("tenant", "name phone"));
  } catch (error) {
    next(error);
  }
});

router.post("/run-billing", async (_req, res, next) => {
  try {
    res.json(await runDailyBilling());
  } catch (error) {
    next(error);
  }
});

module.exports = router;

