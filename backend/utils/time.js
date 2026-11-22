const TIME_ZONE = "Asia/Kolkata";
const IST_OFFSET = "+05:30";

function datePartsInIST(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function dateKeyIST(date = new Date()) {
  const { year, month, day } = datePartsInIST(date);
  return `${year}-${month}-${day}`;
}

function istDateKeyToDate(dateKey, time = "00:00:00.000") {
  return new Date(`${dateKey}T${time}${IST_OFFSET}`);
}

function addDays(dateKey, amount) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function daysInMonth(dateKey) {
  const [year, month] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayOfMonth(dateKey) {
  return Number(dateKey.slice(8, 10));
}

function isLastDayOfMonth(dateKey) {
  return dayOfMonth(dateKey) === daysInMonth(dateKey);
}

function minDateKey(...keys) {
  return keys.filter(Boolean).sort()[0];
}

module.exports = {
  TIME_ZONE,
  dateKeyIST,
  istDateKeyToDate,
  addDays,
  daysInMonth,
  dayOfMonth,
  isLastDayOfMonth,
  minDateKey,
};

