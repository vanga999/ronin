import Decimal from "decimal.js";
import { and, asc, eq } from "drizzle-orm";
import type { DbTransaction } from "@/db";
import { fundNavs, instruments, positionLots, reviews, transactions } from "@/db/schema";

function daysBetween(start: string, end: string) {
  return Math.max(1, Math.ceil((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1);
}

export function createReviewIfClosed(
  tx: DbTransaction,
  accountId: string,
  instrumentId: string,
  endDate: string,
) {
  const openLot = tx.select().from(positionLots).where(and(
    eq(positionLots.accountId, accountId),
    eq(positionLots.instrumentId, instrumentId),
    eq(positionLots.status, "OPEN"),
  )).limit(1).get();
  if (openLot) return null;

  const fund = tx.select().from(instruments).where(eq(instruments.id, instrumentId)).get();
  const trades = tx.select().from(transactions).where(and(
    eq(transactions.accountId, accountId),
    eq(transactions.instrumentId, instrumentId),
  )).orderBy(asc(transactions.transactionDate)).all();
  const subscriptions = trades.filter((trade) => trade.transactionType === "SUBSCRIBE");
  const redemptions = trades.filter((trade) => trade.transactionType === "REDEEM");
  if (!fund || subscriptions.length === 0 || redemptions.length === 0) return null;

  const invested = subscriptions.reduce((sum, trade) => sum.plus(trade.amount ?? 0), new Decimal(0));
  const proceeds = redemptions.reduce((sum, trade) => sum.plus(trade.proceeds ?? 0), new Decimal(0));
  const profit = proceeds.minus(invested);
  const startDate = subscriptions[0].transactionDate;
  const navs = tx.select().from(fundNavs)
    .where(eq(fundNavs.instrumentId, instrumentId))
    .orderBy(asc(fundNavs.navDate)).all()
    .filter((nav) => nav.navDate >= startDate && nav.navDate <= endDate);
  const averageCost = subscriptions.reduce(
    (sum, trade) => sum.plus(trade.shares ?? 0),
    new Decimal(0),
  );
  const costNav = averageCost.eq(0) ? new Decimal(0) : invested.div(averageCost);
  let peak = new Decimal(0);
  let maxReturn = new Decimal(0);
  let maxDrawdown = new Decimal(0);
  for (const nav of navs) {
    const value = new Decimal(nav.unitNav);
    if (value.greaterThan(peak)) peak = value;
    if (!costNav.eq(0)) maxReturn = Decimal.max(maxReturn, value.div(costNav).minus(1));
    if (!peak.eq(0)) maxDrawdown = Decimal.min(maxDrawdown, value.div(peak).minus(1));
  }
  const executedSignals = tx.select().from(transactions).where(and(
    eq(transactions.accountId, accountId),
    eq(transactions.instrumentId, instrumentId),
    eq(transactions.transactionType, "REDEEM"),
  )).all().filter((trade) => trade.note?.includes("纪律信号")).length;
  const disciplineScore = Math.min(100, 70 + (executedSignals > 0 ? 25 : 0) + (redemptions.length <= 2 ? 5 : 0));
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    accountId,
    instrumentId,
    startDate,
    endDate,
    investedPrincipal: invested.toFixed(2),
    proceeds: proceeds.toFixed(2),
    realizedProfit: profit.toFixed(2),
    returnRate: invested.eq(0) ? "0" : profit.div(invested).toFixed(8),
    holdingDays: daysBetween(startDate, endDate),
    maxReturnRate: maxReturn.toFixed(8),
    maxDrawdownRate: maxDrawdown.toFixed(8),
    disciplineScore,
    reviewJson: JSON.stringify({
      fundCode: fund.code,
      fundName: fund.name,
      transactionCount: trades.length,
      redemptionCount: redemptions.length,
      executedSignalCount: executedSignals,
    }),
    createdAt: now,
    updatedAt: now,
  };
  tx.insert(reviews).values(row).run();
  return row;
}
