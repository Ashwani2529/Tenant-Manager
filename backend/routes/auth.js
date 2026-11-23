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

async function tenantProfiles(user) {
  if (user.role !== "tenant" || !user.tenants?.length) return [];
  const profiles = await Tenant.find({ _id: { $in: user.tenants } }).populate("room", "name type monthlyRent");
  const byId = new Map(profiles.map((tenant) => [String(tenant._id), tenant]));
  return user.tenants.map((id) => byId.get(String(id))).filter(Boolean);
}

function publicUser(user, tenants = []) {
  return {
    id: user._id,
    name: user.name,
    phone: user.phone,
    role: user.role,
    tenant: tenants[0] || null,
    tenants,
  };
}

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
    const tenants = await tenantProfiles(user);
    res.json({
      token,
      user: publicUser(user, tenants),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const tenants = await tenantProfiles(req.user);
    res.json({
      user: publicUser(req.user, tenants),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;

