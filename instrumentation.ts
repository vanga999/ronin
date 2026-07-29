export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startDailyFundScheduler, startIntradayEstimateScheduler } = await import("./lib/scheduler");
    startDailyFundScheduler();
    startIntradayEstimateScheduler();
  }
}
