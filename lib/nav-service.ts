import Decimal from "decimal.js";
import { and, asc, desc, eq } from "drizzle-orm";
import { ensureDatabase, runInTransaction } from "@/db";
import { createAuditLog } from "@/db/audit";
import {
  accounts,
  dailySnapshots,
  fundNavs,
  instruments,
  positionLots,
} from "@/db/schema";
import { getFundDataProvider } from "./fund-data";
import { shanghaiDate } from "./date";
import { calculatePosition } from "./portfolio-calculation";
import { generateStrategySignals } from "./strategy-service";

export type SyncResult = {
  synced: number;
  failed: { code: string; name: string; error: string }[];
  snapshots: number;
  signals: number;
};

export async function syncFundNavs(requestId: string, historyLimit = 30): Promise<SyncResult> {
  const database = ensureDatabase();
  const funds = database.select().from(instruments)
    .where(eq(instruments.instrumentType, "MUTUAL_FUND"))
    .orderBy(asc(instruments.code))
    .all();
  const provider = getFundDataProvider();
  const failed: SyncResult["failed"] = [];
  let synced = 0;

  for (const fund of funds) {
    try {
      const records = await provider.getHistoryNav(fund.code, historyLimit);
      runInTransaction((tx) => {
        const now = new Date().toISOString();
        for (const nav of records) {
          tx.insert(fundNavs).values({
            id: crypto.randomUUID(),
            instrumentId: fund.id,
            navDate: nav.navDate,
            unitNav: nav.unitNav,
            accumulatedNav: nav.accumulatedNav,
            dailyChangeRate: nav.dailyChangeRate,
            source: nav.source,
            dataStatus: nav.status,
            fetchedAt: now,
            createdAt: now,
          }).onConflictDoUpdate({
            target: [fundNavs.instrumentId, fundNavs.navDate],
            set: {
              unitNav: nav.unitNav,
              accumulatedNav: nav.accumulatedNav,
              dailyChangeRate: nav.dailyChangeRate,
              source: nav.source,
              dataStatus: nav.status,
              fetchedAt: now,
            },
          }).run();
        }
        createAuditLog(tx, {
          operationType: "SYNC_NAV",
          entityType: "INSTRUMENT",
          entityId: fund.id,
          requestId,
          detail: {
            fundCode: fund.code,
            provider: provider.name,
            records: records.length,
            latestNavDate: records[0]?.navDate ?? null,
          },
        });
      });
      synced += 1;
    } catch (error) {
      failed.push({
        code: fund.code,
        name: fund.name,
        error: error instanceof Error ? error.message : "同步失败",
      });
    }
  }

  const snapshots = generateDailySnapshots(requestId);
  const signalCount = generateStrategySignals(requestId);
  return { synced, failed, snapshots, signals: signalCount };
}

export function generateDailySnapshots(requestId: string, snapshotDate = shanghaiDate()) {
  const database = ensureDatabase();
  const accountRows = database.select().from(accounts).orderBy(asc(accounts.createdAt)).all();
  let count = 0;

  for (const account of accountRows) {
    const lots = database
      .select({
        lot: positionLots,
        fund: instruments,
      })
      .from(positionLots)
      .innerJoin(instruments, eq(positionLots.instrumentId, instruments.id))
      .where(and(eq(positionLots.accountId, account.id), eq(positionLots.status, "OPEN")))
      .all();

    const fundLines = [];
    let invested = new Decimal(0);
    let marketValue = new Decimal(0);
    let dailyProfit = new Decimal(0);
    let staleFundCount = 0;

    for (const { lot, fund } of lots) {
      const navHistory = database.select().from(fundNavs)
        .where(eq(fundNavs.instrumentId, fund.id))
        .orderBy(desc(fundNavs.navDate))
        .limit(2)
        .all();
      const latest = navHistory[0];
      const previous = navHistory[1];
      const principal = new Decimal(lot.remainingPrincipal);
      invested = invested.plus(principal);

      if (!latest) {
        staleFundCount += 1;
        fundLines.push({
          fundCode: fund.code,
          fundName: fund.name,
          navDate: null,
          unitNav: null,
          dailyChangeRate: null,
          investedPrincipal: principal.toFixed(2),
          marketValue: null,
          profitAmount: null,
          returnRate: null,
          status: "NO_NAV",
        });
        continue;
      }

      const calculation = calculatePosition({
        investedPrincipal: lot.remainingPrincipal,
        shares: lot.remainingShares,
        latestNav: latest.unitNav,
        previousNav: previous?.unitNav,
      });
      marketValue = marketValue.plus(calculation.marketValue);
      dailyProfit = dailyProfit.plus(calculation.dailyProfit);

      fundLines.push({
        fundCode: fund.code,
        fundName: fund.name,
        navDate: latest.navDate,
        unitNav: latest.unitNav,
        dailyChangeRate: latest.dailyChangeRate,
        investedPrincipal: principal.toFixed(2),
        marketValue: calculation.marketValue,
        profitAmount: calculation.profitAmount,
        returnRate: calculation.returnRate,
        status: latest.dataStatus,
      });
    }

    const profit = marketValue.minus(invested);
    const returnRate = invested.eq(0) ? new Decimal(0) : profit.div(invested);
    const report = {
      accountId: account.id,
      accountName: account.name,
      snapshotDate,
      generatedAt: new Date().toISOString(),
      dataNotice: "收益仅使用已公布的正式单位净值计算",
      funds: fundLines,
    };
    const now = new Date().toISOString();

    runInTransaction((tx) => {
      tx.insert(dailySnapshots).values({
        id: crypto.randomUUID(),
        accountId: account.id,
        snapshotDate,
        investedPrincipal: invested.toFixed(2),
        marketValue: marketValue.toFixed(2),
        profitAmount: profit.toFixed(2),
        returnRate: returnRate.toFixed(8),
        dailyProfit: dailyProfit.toFixed(2),
        staleFundCount,
        reportJson: JSON.stringify(report),
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [dailySnapshots.accountId, dailySnapshots.snapshotDate],
        set: {
          investedPrincipal: invested.toFixed(2),
          marketValue: marketValue.toFixed(2),
          profitAmount: profit.toFixed(2),
          returnRate: returnRate.toFixed(8),
          dailyProfit: dailyProfit.toFixed(2),
          staleFundCount,
          reportJson: JSON.stringify(report),
          updatedAt: now,
        },
      }).run();
      createAuditLog(tx, {
        operationType: "GENERATE_DAILY_REPORT",
        entityType: "FUND_ACCOUNT",
        entityId: account.id,
        requestId,
        detail: { snapshotDate, fundCount: fundLines.length, staleFundCount },
      });
    });
    count += 1;
  }
  return count;
}

export function getLatestReports(accountId?: string) {
  const database = ensureDatabase();
  const rows = accountId
    ? database.select().from(dailySnapshots)
        .where(eq(dailySnapshots.accountId, accountId))
        .orderBy(desc(dailySnapshots.snapshotDate))
        .limit(30).all()
    : database.select().from(dailySnapshots)
        .orderBy(desc(dailySnapshots.snapshotDate))
        .limit(30).all();
  return rows.map((row) => ({ ...row, report: JSON.parse(row.reportJson) }));
}
