const cron = require("node-cron");
const { runDailyBilling } = require("./billing");

function startDailyBillingScheduler() {
  return cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        const result = await runDailyBilling();
        console.log("Midnight billing completed", result);
      } catch (error) {
        console.error("Midnight billing failed", error);
      }
    },
    {
      name: "homely-daily-rent-billing",
      timezone: "Asia/Kolkata",
      noOverlap: true,
    },
  );
}

module.exports = { startDailyBillingScheduler };
