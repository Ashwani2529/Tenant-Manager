const express = require("express");
const { User, Tenant } = require("../models");
const { authenticate } = require("../middleware/auth");
const {
  hashPassword,
  verifyPassword,
  signToken,
  normalizePhone,
  isValidPhone,
} = require("../utils/security");

const router = express.Router();
const attempts = new Map();

router.get("/status", async (_req, res, next) => {
  try {
    const bootstrapRequired = !(await User.exists({ role: "admin" }));
    res.json({ bootstrapRequired, setupKeyRequired: Boolean(process.env.ADMIN_SETUP_KEY) });
  } catch (error) {
    next(error);
  }
});

router.post("/bootstrap", async (req, res, next) => {
  try {
    if (await User.exists({ role: "admin" })) {
      return res.status(409).json({ message: "The owner account is already configured" });
    }
    if (process.env.ADMIN_SETUP_KEY && req.body.setupKey !== process.env.ADMIN_SETUP_KEY) {
      return res.status(403).json({ message: "Invalid setup key" });
    }

    const phone = normalizePhone(req.body.phone);
    if (!isValidPhone(phone)) return res.status(400).json({ message: "Enter a valid 10-digit phone number" });
    const user = await User.create({
      role: "admin",
      name: String(req.body.name || "Owner").trim(),
      phone,
      passwordHash: await hashPassword(req.body.password),
    });
    const token = signToken({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET);
    res.status(201).json({ token, user: { id: user._id, name: user.name, phone, role: user.role } });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const key = `${req.ip}:${phone}`;
    const attempt = attempts.get(key);
    if (attempt?.blockedUntil > Date.now()) {
      return res.status(429).json({ message: "Too many attempts. Please try again in a few minutes." });
    }

    const user = await User.findOne({ phone, active: true }).select("+passwordHash");
    const valid = user && (await verifyPassword(req.body.password, user.passwordHash));
    if (!valid) {
      const count = (attempt?.count || 0) + 1;
      attempts.set(key, { count, blockedUntil: count >= 5 ? Date.now() + 15 * 60 * 1000 : 0 });
      return res.status(401).json({ message: "Phone number or password is incorrect" });
    }

    attempts.delete(key);
    user.lastLoginAt = new Date();
    await user.save();
    const token = signToken({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET);
    res.json({
      token,
      user: { id: user._id, name: user.name, phone: user.phone, role: user.role, tenant: user.tenant },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const tenant = req.user.tenant ? await Tenant.findById(req.user.tenant).populate("room") : null;
    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        phone: req.user.phone,
        role: req.user.role,
        tenant,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

