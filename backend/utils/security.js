const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Password must contain at least 8 characters");
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${Buffer.from(derivedKey).toString("hex")}`;
}

async function verifyPassword(password, storedValue) {
  const [algorithm, salt, key] = String(storedValue || "").split("$");
  if (algorithm !== "scrypt" || !salt || !key) return false;

  const derivedKey = Buffer.from(await scrypt(password, salt, 64));
  const storedKey = Buffer.from(key, "hex");
  return storedKey.length === derivedKey.length && crypto.timingSafeEqual(storedKey, derivedKey);
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signToken(payload, secret, expiresInSeconds = 60 * 60 * 24 * 7) {
  if (!secret) throw new Error("JWT_SECRET is not configured");

  const header = base64url({ alg: "HS256", typ: "JWT" });
  const body = base64url({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  });
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64url");
  return `${header}.${body}.${signature}`;
}

function verifyToken(token, secret) {
  if (!secret || !token) throw new Error("Invalid session");
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) throw new Error("Invalid session");

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error("Invalid session");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Session expired");
  }
  return payload;
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function isValidPhone(phone) {
  return /^\d{10}$/.test(normalizePhone(phone));
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  normalizePhone,
  isValidPhone,
};

