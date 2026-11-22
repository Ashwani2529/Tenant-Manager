const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const systemRoutes = require("./routes/system");
const adminRoutes = require("./routes/admin");
const tenantRoutes = require("./routes/tenant");

const app = express();
const origins = String(process.env.CLIENT_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origins.includes(origin)) return callback(null, true);
      callback(new Error("Origin is not allowed"));
    },
  }),
);
app.use(express.json({ limit: "100kb" }));

app.get("/", (_req, res) => res.json({ name: "Homely Tenants API", status: "running" }));
app.use("/api/auth", authRoutes);
app.use("/api/system", systemRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/tenant", tenantRoutes);

app.use((_req, res) => res.status(404).json({ message: "Route not found" }));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || "value";
    return res.status(409).json({ message: `That ${field} is already in use` });
  }
  if (error?.name === "ValidationError") {
    return res.status(400).json({ message: Object.values(error.errors).map((item) => item.message).join(", ") });
  }
  res.status(error.status || 500).json({ message: error.message || "Something went wrong" });
});

async function start() {
  for (const key of ["MONGO_URI", "JWT_SECRET", "CRON_SECRET"]) {
    if (!process.env[key]) throw new Error(`${key} is required. Add it to backend/.env.`);
  }
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  const port = Number(process.env.PORT) || 5000;
  const server = app.listen(port, "0.0.0.0", () => console.log(`Homely Tenants API running on port ${port}`));
  process.on("SIGTERM", async () => {
    server.close();
    await mongoose.disconnect();
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Unable to start server:", error.message);
    process.exitCode = 1;
  });
}

module.exports = app;

