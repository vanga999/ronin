import { shanghaiDate } from "./date";
import { getLatestReports, syncFundNavs } from "./nav-service";
import { shanghaiClock } from "./date";
import { syncIntradayEstimates } from "./intraday-estimate";

const schedulerState = globalThis as typeof globalThis & {
  fundDailyTimer?: NodeJS.Timeout;
  fundIntradayTimer?: NodeJS.Timeout;
  fundIntradayBucket?: string;
};

function millisecondsUntilNextRun() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const elapsedMinutes = hour * 60 + minute;
  const targetMinutes = 20 * 60;
  const minutes = elapsedMinutes < targetMinutes
    ? targetMinutes - elapsedMinutes
    : 24 * 60 - elapsedMinutes + targetMinutes;
  return Math.max(minutes * 60_000, 60_000);
}

async function runScheduledSync() {
  try {
    await syncFundNavs(`scheduler-${crypto.randomUUID()}`);
  } catch (error) {
    console.error("Daily fund sync failed", error);
  } finally {
    schedulerState.fundDailyTimer = setTimeout(runScheduledSync, millisecondsUntilNextRun());
  }
}

export function startDailyFundScheduler() {
  if (schedulerState.fundDailyTimer) return;

  const nowHour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hour12: false,
  }).format(new Date()));
  const todayCompleted = getLatestReports().some((report) => report.snapshotDate === shanghaiDate());

  if (nowHour >= 20 && !todayCompleted) {
    schedulerState.fundDailyTimer = setTimeout(runScheduledSync, 2_000);
  } else {
    schedulerState.fundDailyTimer = setTimeout(runScheduledSync, millisecondsUntilNextRun());
  }
}

function intradayBucket(now = new Date()) {
  const { hour, minute } = shanghaiClock(now);
  return `${shanghaiDate(now)} ${String(hour).padStart(2, "0")}:${minute < 30 ? "00" : "30"}`;
}

export function isIntradayWindow(now = new Date()) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(now);
  if (weekday === "Sat" || weekday === "Sun") return false;
  const { hour, minute } = shanghaiClock(now);
  const value = hour * 60 + minute;
  return (value >= 570 && value <= 690) || (value >= 780 && value <= 900);
}

async function checkIntradayEstimate() {
  const now = new Date();
  const bucket = intradayBucket(now);
  if (isIntradayWindow(now) && schedulerState.fundIntradayBucket !== bucket) {
    schedulerState.fundIntradayBucket = bucket;
    try {
      await syncIntradayEstimates(`intraday-scheduler-${crypto.randomUUID()}`, now);
    } catch (error) {
      console.error("Intraday fund estimate failed", error);
    }
  }
}

export function startIntradayEstimateScheduler() {
  if (schedulerState.fundIntradayTimer) return;
  schedulerState.fundIntradayTimer = setInterval(() => void checkIntradayEstimate(), 60_000);
  setTimeout(() => void checkIntradayEstimate(), 2_500);
}
