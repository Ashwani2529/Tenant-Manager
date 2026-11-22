const {
  Tenant,
  Room,
  LedgerEntry,
  Notification,
} = require("../models");
const {
  dateKeyIST,
  istDateKeyToDate,
  addDays,
  daysInMonth,
  dayOfMonth,
  isLastDayOfMonth,
} = require("../utils/time");

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

function dailyRentAmount(room, dateKey, halfDay = false) {
  const divisor = room.type === "double" ? 2 : 1;
  const monthlyShareInPaise = Math.round((rateForDate(room, dateKey) * 100) / divisor);
  const monthDays = daysInMonth(dateKey);
  const base = Math.floor(monthlyShareInPaise / monthDays);
  const remainder = monthlyShareInPaise % monthDays;
  const todayPaise = base + (dayOfMonth(dateKey) <= remainder ? 1 : 0);
  return money((halfDay ? Math.round(todayPaise / 2) : todayPaise) / 100);
}

async function balanceForTenant(tenantId) {
  const [result] = await LedgerEntry.aggregate([
    { $match: { tenant: tenantId } },
    { $group: { _id: null, balance: { $sum: "$amount" } } },
  ]);
  return money(result?.balance || 0);
}

async function advancePaidThrough(tenant, room, rentAmount) {
  let remainingPaise = Math.round(Number(rentAmount) * 100);
  let cursor = new Date(tenant.rentPaidThrough || tenant.joiningAt);
  let guard = 0;

  while (remainingPaise > 0 && guard < 3660) {
    const key = dateKeyIST(cursor);
    const start = istDateKeyToDate(key);
    const next = istDateKeyToDate(addDays(key, 1));
    const dayPaise = Math.round(dailyRentAmount(room, key) * 100);
    const remainingFraction = Math.max(0, (next - cursor) / (next - start));
    const remainingDayPaise = Math.max(1, Math.round(dayPaise * remainingFraction));

    if (remainingPaise >= remainingDayPaise) {
      remainingPaise -= remainingDayPaise;
      cursor = next;
    } else {
      const advanceMs = (remainingPaise / dayPaise) * (next - start);
      cursor = new Date(cursor.getTime() + advanceMs);
      remainingPaise = 0;
    }
    guard += 1;
  }

  return cursor;
}

async function createMonthEndNotifications(dateKey) {
  if (!isLastDayOfMonth(dateKey)) return 0;
  const tenants = await Tenant.find({ status: "active" }).select("_id");
  let created = 0;

  for (const tenant of tenants) {
    try {
      await Notification.create({
        tenant: tenant._id,
        type: "month_end",
        title: "Month-end update",
        message: "Your month-end rent summary is ready. Open your ledger to review the latest balance.",
        uniqueKey: `month-end:${tenant._id}:${dateKey.slice(0, 7)}`,
      });
      created += 1;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  return created;
}

async function runDailyBilling(now = new Date()) {
  const todayKey = dateKeyIST(now);
  const tenants = await Tenant.find({ status: { $in: ["active", "moved_out"] } }).populate("room");
  let chargesCreated = 0;
  let tenantsChecked = 0;

  for (const tenant of tenants) {
    if (!tenant.room) continue;
    const startKey = dateKeyIST(tenant.billingStartAt || tenant.joiningAt);
    const moveOutKey = tenant.moveOutAt ? dateKeyIST(tenant.moveOutAt) : null;
    const lastCharge = await LedgerEntry.findOne({
      tenant: tenant._id,
      category: "rent",
      source: "cron",
      "metadata.dateKey": { $exists: true },
    }).sort({ effectiveAt: -1 });
    let key = lastCharge?.metadata?.dateKey ? addDays(lastCharge.metadata.dateKey, 1) : startKey;
    let guard = 0;

    while (key <= todayKey && (!moveOutKey || key <= moveOutKey) && guard < 3660) {
      const halfDay = Boolean(moveOutKey && key === moveOutKey);
      const amount = dailyRentAmount(tenant.room, key, halfDay);
      try {
        await LedgerEntry.create({
          tenant: tenant._id,
          room: tenant.room._id,
          kind: "charge",
          category: "rent",
          amount,
          description: halfDay ? `Half-day rent for ${key}` : `Daily rent for ${key}`,
          effectiveAt: istDateKeyToDate(key),
          source: "cron",
          uniqueKey: `rent:${tenant._id}:${key}`,
          metadata: { dateKey: key, halfDay, monthlyRate: rateForDate(tenant.room, key) },
        });
        chargesCreated += 1;
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
      key = addDays(key, 1);
      guard += 1;
    }
    tenantsChecked += 1;
  }

  const notificationsCreated = await createMonthEndNotifications(todayKey);
  return { dateKey: todayKey, tenantsChecked, chargesCreated, notificationsCreated };
}

module.exports = {
  money,
  rateForDate,
  dailyRentAmount,
  balanceForTenant,
  advancePaidThrough,
  runDailyBilling,
};

