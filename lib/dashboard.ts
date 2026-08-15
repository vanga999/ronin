import Decimal from "decimal.js";
import { asc, desc, eq } from "drizzle-orm";
import { ensureDatabase } from "@/db";
import { accounts, dailySnapshots, fundNavs, instruments, positionLots, reviews, strategies, transactions } from "@/db/schema";
import { getCurrentSignals, getRecentSignals } from "@/lib/strategy-service";
import { calculateHoldingEfficiency } from "@/lib/portfolio-calculation";
import { calculateLedger } from "@/lib/ledger";
import { getTodayIntradayEstimates } from "@/lib/intraday-estimate";

export function getDashboardData() {
  const database = ensureDatabase();
  const accountRows = database.select().from(accounts).orderBy(asc(accounts.createdAt)).all();
  const fundRows = database.select().from(instruments).orderBy(asc(instruments.code)).all();
  const strategyRows = database.select().from(strategies).orderBy(asc(strategies.createdAt)).all();
  const lots = database
    .select({
      id: positionLots.id,
      accountId: positionLots.accountId,
      instrumentId: positionLots.instrumentId,
      accountName: accounts.name,
      fundCode: instruments.code,
      fundName: instruments.name,
      purchaseDate: positionLots.purchaseDate,
      purchaseAmount: positionLots.purchaseAmount,
      confirmedNav: positionLots.confirmedNav,
      confirmedShares: positionLots.confirmedShares,
      remainingShares: positionLots.remainingShares,
      remainingPrincipal: positionLots.remainingPrincipal,
      purchaseFee: positionLots.purchaseFee,
      status: positionLots.status,
    })
    .from(positionLots)
    .innerJoin(accounts, eq(positionLots.accountId, accounts.id))
    .innerJoin(instruments, eq(positionLots.instrumentId, instruments.id))
    .orderBy(desc(positionLots.purchaseDate))
    .all();
  const valuedLots = lots.map((lot) => {
    const navHistory = database.select().from(fundNavs)
      .where(eq(fundNavs.instrumentId, lot.instrumentId))
      .orderBy(desc(fundNavs.navDate))
      .limit(2)
      .all();
    const latestNav = navHistory[0];
    const previousNav = navHistory[1];
    if (!latestNav) return {
      ...lot,
      latestNav: null,
      previousNavDate: null,
      marketValue: null,
      profitAmount: null,
      returnRate: null,
      dailyProfit: null,
      efficiency: null,
    };
    const marketValue = new Decimal(lot.remainingShares).mul(latestNav.unitNav);
    const profit = marketValue.minus(lot.remainingPrincipal);
    const dailyProfit = previousNav
      ? new Decimal(lot.remainingShares).mul(
          new Decimal(latestNav.unitNav).minus(previousNav.unitNav),
        )
      : null;
    return {
      ...lot,
      latestNav,
      previousNavDate: previousNav?.navDate ?? null,
      marketValue: marketValue.toFixed(2),
      profitAmount: profit.toFixed(2),
      dailyProfit: dailyProfit?.toFixed(2) ?? null,
      efficiency: calculateHoldingEfficiency({
        purchaseDate: lot.purchaseDate,
        valuationDate: latestNav.navDate,
        investedPrincipal: lot.remainingPrincipal,
        marketValue: marketValue.toFixed(),
      }),
      returnRate: new Decimal(lot.remainingPrincipal).eq(0)
        ? "0"
        : profit.div(lot.remainingPrincipal).toFixed(8),
    };
  });
  const transactionRows = database
    .select({
      id: transactions.id,
      fundCode: instruments.code,
      fundName: instruments.name,
      transactionType: transactions.transactionType,
      transactionDate: transactions.transactionDate,
      amount: transactions.amount,
      nav: transactions.nav,
      shares: transactions.shares,
      fee: transactions.fee,
      proceeds: transactions.proceeds,
      realizedProfit: transactions.realizedProfit,
      note: transactions.note,
    })
    .from(transactions)
    .innerJoin(instruments, eq(transactions.instrumentId, instruments.id))
    .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
    .all();

  const invested = valuedLots
    .filter((lot) => lot.status === "OPEN")
    .reduce((sum, lot) => sum.plus(lot.remainingPrincipal), new Decimal(0));
  const shares = valuedLots
    .filter((lot) => lot.status === "OPEN")
    .reduce((sum, lot) => sum.plus(lot.remainingShares), new Decimal(0));

  const latestReportRow = database.select().from(dailySnapshots)
    .orderBy(desc(dailySnapshots.snapshotDate))
    .limit(1)
    .get() ?? null;
  const latestReport = latestReportRow
    ? (() => {
        const report = JSON.parse(latestReportRow.reportJson) as {
          generatedAt?: string;
          funds?: Array<{ navDate?: string | null }>;
        };
        const navDates = [...new Set(
          (report.funds ?? [])
            .map((fund) => fund.navDate)
            .filter((date): date is string => Boolean(date)),
        )].sort();
        return {
          ...latestReportRow,
          generatedAt: report.generatedAt ?? latestReportRow.updatedAt,
          latestNavDate: navDates.at(-1) ?? null,
          earliestNavDate: navDates.at(0) ?? null,
          hasMixedNavDates: navDates.length > 1,
        };
      })()
    : null;
  const marketValue = valuedLots.reduce(
    (sum, lot) => sum.plus(lot.marketValue ?? 0),
    new Decimal(0),
  );
  const profit = marketValue.minus(invested);
  const ledger = calculateLedger(transactionRows, marketValue.toFixed(), profit.toFixed());
  const reviewRows = database.select({
    review: reviews,
    fundCode: instruments.code,
    fundName: instruments.name,
  }).from(reviews)
    .innerJoin(instruments, eq(reviews.instrumentId, instruments.id))
    .orderBy(desc(reviews.endDate)).all()
    .map((row) => ({ ...row.review, fundCode: row.fundCode, fundName: row.fundName }));
  const history = database.select().from(dailySnapshots)
    .orderBy(asc(dailySnapshots.snapshotDate)).limit(120).all();

  return {
    accounts: accountRows,
    instruments: fundRows,
    strategies: strategyRows,
    lots: valuedLots,
    transactions: transactionRows,
    ledger,
    reviews: reviewRows,
    history,
    latestReport,
    signals: getCurrentSignals(),
    signalHistory: getRecentSignals(),
    intradayEstimates: getTodayIntradayEstimates(),
    summary: {
      accountCount: accountRows.length,
      fundCount: fundRows.length,
      openLotCount: lots.filter((lot) => lot.status === "OPEN").length,
      investedAmount: invested.toFixed(2),
      totalShares: shares.toFixed(4),
      marketValue: marketValue.toFixed(2),
      profitAmount: profit.toFixed(2),
      realizedProfit: ledger.realizedProfit,
      returnRate: invested.eq(0) ? "0" : profit.div(invested).toFixed(8),
    },
  };
}
