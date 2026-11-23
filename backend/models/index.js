const mongoose = require("mongoose");

const { Schema } = mongoose;
const money = { type: Number, min: 0, default: 0 };

const userSchema = new Schema(
  {
    role: { type: String, enum: ["admin", "tenant"], required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    tenants: { type: [{ type: Schema.Types.ObjectId, ref: "Tenant" }], default: [] },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

const rateHistorySchema = new Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, required: true },
  },
  { _id: false },
);

const roomSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    type: { type: String, enum: ["single", "double"], required: true },
    monthlyRent: { ...money, required: true },
    rentHistory: { type: [rateHistorySchema], default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const tenantSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    room: { type: Schema.Types.ObjectId, ref: "Room", required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    joiningAt: { type: Date, required: true },
    billingStartAt: { type: Date, required: true },
    moveOutAt: { type: Date, default: null },
    status: { type: String, enum: ["active", "moved_out"], default: "active" },
    rentPaidThrough: { type: Date, required: true },
  },
  { timestamps: true },
);

const configurationSchema = new Schema(
  {
    key: { type: String, default: "primary", unique: true },
    propertyName: { type: String, default: "Homely Tenants" },
    currency: { type: String, default: "INR" },
    timezone: { type: String, default: "Asia/Kolkata" },
    electricityPrice: money,
    electricityPriceHistory: {
      type: [new Schema({ price: Number, effectiveFrom: Date }, { _id: false })],
      default: [],
    },
    initialDataSeededAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const ledgerEntrySchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    room: { type: Schema.Types.ObjectId, ref: "Room", default: null },
    kind: { type: String, enum: ["charge", "payment", "adjustment", "opening"], required: true },
    category: { type: String, enum: ["rent", "electricity", "general"], required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true, trim: true },
    effectiveAt: { type: Date, required: true, index: true },
    source: { type: String, enum: ["cron", "admin", "system"], required: true },
    uniqueKey: { type: String, sparse: true, unique: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

ledgerEntrySchema.index({ tenant: 1, effectiveAt: -1 });

const paymentSchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    totalAmount: { type: Number, required: true, min: 0.01 },
    rentAmount: { ...money },
    electricityAmount: { ...money },
    paidAt: { type: Date, required: true },
    note: { type: String, trim: true, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

const meterReadingSchema = new Schema(
  {
    room: { type: Schema.Types.ObjectId, ref: "Room", required: true, index: true },
    units: { type: Number, required: true, min: 0 },
    previousUnits: { type: Number, min: 0, default: null },
    consumedUnits: { type: Number, min: 0, default: 0 },
    rate: { ...money },
    totalCharge: { ...money },
    readAt: { type: Date, required: true },
    isOpening: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

meterReadingSchema.index({ room: 1, readAt: -1 });

const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    tenant: { type: Schema.Types.ObjectId, ref: "Tenant", default: null, index: true },
    entityType: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, default: null },
    action: { type: String, required: true },
    reason: { type: String, trim: true, required: true },
    changes: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

const notificationSchema = new Schema(
  {
    tenant: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    type: { type: String, enum: ["month_end", "electricity", "payment"], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    uniqueKey: { type: String, sparse: true, unique: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = {
  User: mongoose.model("User", userSchema),
  Room: mongoose.model("Room", roomSchema),
  Tenant: mongoose.model("Tenant", tenantSchema),
  Configuration: mongoose.model("Configuration", configurationSchema),
  LedgerEntry: mongoose.model("LedgerEntry", ledgerEntrySchema),
  Payment: mongoose.model("Payment", paymentSchema),
  MeterReading: mongoose.model("MeterReading", meterReadingSchema),
  AuditLog: mongoose.model("AuditLog", auditLogSchema),
  Notification: mongoose.model("Notification", notificationSchema),
};

