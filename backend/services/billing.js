const mongoose = require("mongoose");
const { Tenant, LedgerEntry, Notification } = require("../models");
const { TIME_ZONE, dateKeyIST, istDateKeyToDate, addDays, daysInMonth, dayOfMonth, isLastDayOfMonth } = require("../utils/time");

const rentDateFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

function money(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function rateForDate(room, dateKey) {
  const at = istDateKeyToDate(dateKey, "23:59:59.999");
  const matching = [...(room.rentHistory || [])]
    .filter((item) => new Date(item.effectiveFrom) <= at)
    .sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom))[0];
  return Number(matching?.amount ?? room.monthlyRent);
}

function dailyRentAmount(room, dateKey) {
  const divisor = room.type === "double" ? 2 : 1;
  const monthlyShareInPaise = Math.round((rateForDate(room, dateKey) * 100) / divisor);
  const monthDays = daysInMonth(dateKey);
  const base = Math.floor(monthlyShareInPaise / monthDays);
  const remainder = monthlyShareInPaise % monthDays;
  return money((base + (dayOfMonth(dateKey) <= remainder ? 1 : 0)) / 100);
}

function calculateRentDue(tenant, now = new Date()) {
  if (!tenant?.room) return { amount: 0, startAt: null, endAt: null, startDate: null, endDate: null };

  const billingStart = new Date(tenant.billingStartAt || tenant.joiningAt);
  const paidBoundary = tenant.rentPaidThrough
    ? new Date(new Date(tenant.rentPaidThrough).getTime() + 1)
    : billingStart;
  const startAt = new Date(Math.max(billingStart.getTime(), paidBoundary.getTime()));
  const todayKey = dateKeyIST(now);
  const endOfToday = istDateKeyToDate(addDays(todayKey, 1));
  const endExclusive = tenant.moveOutAt
    ? new Date(Math.min(endOfToday.getTime(), new Date(tenant.moveOutAt).getTime()))
    : endOfToday;

  if (startAt >= endExclusive) {
    return { amount: 0, startAt: null, endAt: null, startDate: null, endDate: null };
  }

  let cursor = new Date(startAt);
  let totalPaise = 0;
  let guard = 0;
  while (cursor < endExclusive && guard < 3660) {
    const dateKey = dateKeyIST(cursor);
    const dayStart = istDateKeyToDate(dateKey);
    const nextDay = istDateKeyToDate(addDays(dateKey, 1));
    const segmentEnd = new Date(Math.min(nextDay.getTime(), endExclusive.getTime()));
    const dayPaise = Math.round(dailyRentAmount(tenant.room, dateKey) * 100);
    const fraction = (segmentEnd - cursor) / (nextDay - dayStart);
    totalPaise += Math.round(dayPaise * fraction);
    cursor = segmentEnd;
    guard += 1;
  }

  const endAt = new Date(endExclusive.getTime() - 1);
  return {
    amount: totalPaise / 100,
    startAt,
    endAt,
    startDate: dateKeyIST(startAt),
    endDate: dateKeyIST(endAt),
  };
}

function objectId(value) {
  return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value));
}

function countedLedgerMatch(tenantId) {
  return {
    tenant: objectId(tenantId),
    $nor: [
      { category: "rent", source: "cron" },
      { category: "rent", kind: "payment", "metadata.storedRentOffset": { $ne: true } },
    ],
  };
}

async function storedCategoryBalances(tenantId) {
  const totals = await LedgerEntry.aggregate([
    { $match: countedLedgerMatch(tenantId) },
    { $group: { _id: "$category", amount: { $sum: "$amount" } } },
  ]);
  return Object.fromEntries(totals.map((item) => [item._id, money(item.amount)]));
}

async function financialSummaryForTenant(tenantOrId, now = new Date()) {
  const tenant = tenantOrId?.room?.monthlyRent != null
    ? tenantOrId
    : await Tenant.findById(tenantOrId?._id || tenantOrId).populate("room");
  if (!tenant) throw Object.assign(new Error("Tenant not found"), { status: 404 });

  const stored = await storedCategoryBalances(tenant._id);
  const liveRent = calculateRentDue(tenant, now);
  const categories = {
    rent: money((stored.rent || 0) + liveRent.amount),
    electricity: money(stored.electricity || 0),
    general: money(stored.general || 0),
  };
  const balance = money(Object.values(categories).reduce((sum, amount) => sum + amount, 0));
  return { balance, categories, liveRent };
}

async function balanceForTenant(tenantOrId, now = new Date()) {
  return (await financialSummaryForTenant(tenantOrId, now)).balance;
}

function liveRentLedgerEntry(tenant, liveRent) {
  if (!(liveRent.amount > 0)) return null;
  return {
    _id: `live-rent:${tenant._id}:${liveRent.endDate}`,
    tenant: tenant._id,
    room: tenant.room?._id || tenant.room,
    kind: "charge",
    category: "rent",
    amount: liveRent.amount,
    description: `Rent due: ${rentDateFormatter.format(liveRent.startAt)} – ${rentDateFormatter.format(liveRent.endAt)}`,
    effectiveAt: liveRent.endAt,
    source: "system",
    virtual: true,
    metadata: { live: true, startDate: liveRent.startDate, endDate: liveRent.endDate },
  };
}

async function ledgerForTenant(tenantOrId, { now = new Date(), includeTenant = false, limit = 500 } = {}) {
  const tenant = tenantOrId?.room?.monthlyRent != null
    ? tenantOrId
    : await Tenant.findById(tenantOrId?._id || tenantOrId).populate("room");
  if (!tenant) throw Object.assign(new Error("Tenant not found"), { status: 404 });

  const [stored, summary] = await Promise.all([
    LedgerEntry.find(countedLedgerMatch(tenant._id))
      .sort({ effectiveAt: -1, createdAt: -1 })
      .limit(Math.max(0, limit - 1))
      .populate("room", "name")
      .populate("tenant", "name phone")
      .lean(),
    financialSummaryForTenant(tenant, now),
  ]);
  const live = liveRentLedgerEntry(tenant, summary.liveRent);
  if (live && includeTenant) live.tenant = { _id: tenant._id, name: tenant.name, phone: tenant.phone };
  return [...(live ? [live] : []), ...stored].sort((a, b) => new Date(b.effectiveAt) - new Date(a.effectiveAt));
}

async function storedRentBalanceForTenant(tenantId) {
  return (await storedCategoryBalances(tenantId)).rent || 0;
}

async function advancePaidThrough(tenant, room, rentAmount) {
  let remainingPaise = Math.round(Number(rentAmount) * 100);
  if (remainingPaise <= 0) return tenant.rentPaidThrough;

  const billingStart = new Date(tenant.billingStartAt || tenant.joiningAt);
  const paidBoundary = tenant.rentPaidThrough
    ? new Date(new Date(tenant.rentPaidThrough).getTime() + 1)
    : billingStart;
  let cursor = new Date(Math.max(billingStart.getTime(), paidBoundary.getTime()));
  let guard = 0;

  while (remainingPaise > 0 && guard < 3660) {
    const dateKey = dateKeyIST(cursor);
    const dayStart = istDateKeyToDate(dateKey);
    const nextDay = istDateKeyToDate(addDays(dateKey, 1));
    const dayPaise = Math.round(dailyRentAmount(room, dateKey) * 100);
    const remainingFraction = (nextDay - cursor) / (nextDay - dayStart);
    const remainingDayPaise = Math.max(1, Math.round(dayPaise * remainingFraction));

    if (remainingPaise >= remainingDayPaise) {
      remainingPaise -= remainingDayPaise;
      cursor = nextDay;
    } else {
      cursor = new Date(cursor.getTime() + (remainingPaise / dayPaise) * (nextDay - dayStart));
      remainingPaise = 0;
    }
    guard += 1;
  }

  return new Date(cursor.getTime() - 1);
}

async function ensureMonthEndNotification(tenantId, now = new Date()) {
  const dateKey = dateKeyIST(now);
  if (!isLastDayOfMonth(dateKey)) return null;
  const uniqueKey = `month-end:${tenantId}:${dateKey.slice(0, 7)}`;
  return Notification.findOneAndUpdate(
    { uniqueKey },
    {
      $setOnInsert: {
        tenant: tenantId,
        type: "month_end",
        title: "Month-end update",
        message: "Your month-end rent summary is ready. Open your ledger to review the latest balance.",
        uniqueKey,
      },
    },
    { new: true, upsert: true },
  );
}

module.exports = {
  money,
  rateForDate,
  dailyRentAmount,
  calculateRentDue,
  financialSummaryForTenant,
  balanceForTenant,
  ledgerForTenant,
  storedRentBalanceForTenant,
  advancePaidThrough,
  ensureMonthEndNotification,
};
