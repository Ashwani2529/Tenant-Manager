const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateRentDue, advancePaidThrough } = require("../services/billing");
const { istDateKeyToDate } = require("../utils/time");

function room(monthlyRent, type = "single") {
  return {
    monthlyRent,
    type,
    rentHistory: [{ amount: monthlyRent, effectiveFrom: istDateKeyToDate("2026-01-01") }],
  };
}

function tenantFor(roomValue, paidThrough, extra = {}) {
  return {
    room: roomValue,
    joiningAt: istDateKeyToDate("2026-01-01"),
    billingStartAt: istDateKeyToDate("2026-01-01"),
    rentPaidThrough: istDateKeyToDate(paidThrough, "23:59:59.999"),
    ...extra,
  };
}

test("includes the full current day in live rent", () => {
  const tenant = tenantFor(room(3000), "2026-10-31");
  const result = calculateRentDue(tenant, istDateKeyToDate("2026-11-23", "12:00:00.000"));
  assert.equal(result.amount, 2300);
  assert.equal(result.startDate, "2026-11-01");
  assert.equal(result.endDate, "2026-11-23");
});

test("splits double-room rent and preserves monthly cent totals", () => {
  const tenant = tenantFor(room(2500, "double"), "2026-11-06");
  const result = calculateRentDue(tenant, istDateKeyToDate("2026-11-23", "12:00:00.000"));
  assert.equal(result.amount, 708.36);
});

test("charges only half of the move-out date", () => {
  const tenant = tenantFor(room(1500), "2026-10-31", {
    moveOutAt: istDateKeyToDate("2026-11-10", "12:00:00.000"),
  });
  const result = calculateRentDue(tenant, istDateKeyToDate("2026-11-23", "12:00:00.000"));
  assert.equal(result.amount, 475);
  assert.equal(result.endDate, "2026-11-10");
});

test("a full daily payment advances paid-through to end of day", async () => {
  const roomValue = room(3000);
  const tenant = tenantFor(roomValue, "2026-10-31");
  const paidThrough = await advancePaidThrough(tenant, roomValue, 100);
  assert.equal(paidThrough.toISOString(), istDateKeyToDate("2026-11-01", "23:59:59.999").toISOString());
});

test("uses the actual number of days in the calendar month", () => {
  const tenant = tenantFor(room(2800), "2027-01-31");
  const result = calculateRentDue(tenant, istDateKeyToDate("2027-02-14", "12:00:00.000"));
  assert.equal(result.amount, 1400);
});

test("applies room price changes only from their effective date", () => {
  const roomValue = room(3000);
  roomValue.monthlyRent = 3300;
  roomValue.rentHistory.push({ amount: 3300, effectiveFrom: istDateKeyToDate("2026-11-11") });
  const tenant = tenantFor(roomValue, "2026-10-31");
  const result = calculateRentDue(tenant, istDateKeyToDate("2026-11-20", "12:00:00.000"));
  assert.equal(result.amount, 2100);
});
