const { User } = require("../models");
const { verifyToken } = require("../utils/security");

async function authenticate(req, res, next) {
  try {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = verifyToken(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user || !user.active) return res.status(401).json({ message: "Session is no longer active" });
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: error.message || "Authentication required" });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ message: "You do not have access to this action" });
    next();
  };
}

module.exports = { authenticate, requireRole };

