import Decimal from "decimal.js";
import { asc, desc, eq } from "drizzle-orm";
import { ensureDatabase, runInTransaction } from "@/db";
import { createAuditLog } from "@/db/audit";
import { fundNavs, instruments, intradayEstimates, positionLots } from "@/db/schema";
import { shanghaiClock, shanghaiDate } from "./date";

type Holding = { secid: string; code: string; weightRate: string };

export function parsePublishedHoldings(source: string) {
  const disclosureDate = source.match(/截止至：<font[^>]*>(\d{4}-\d{2}-\d{2})<\/font>/)?.[1] ?? null;
  const holdings: Holding[] = [];
  for (const row of source.split("<tr>")) {
    const secid = row.match(/quote\.eastmoney\.com\/unify\/r\/([01]\.\d{6})/)?.[1];
    const weight = row.match(/class='red'[^]*?<\/td><td class='tor'>([\d.]+)%<\/td>/)?.[1];
    if (!secid || !weight) continue;
    holdings.push({ secid, code: secid.slice(2), weightRate: new Decimal(weight).div(100).toFixed(8) });
  }
  return { disclosureDate, holdings };
}

export function calculateHoldingEstimate(
  holdings: Holding[],
  quotes: Array<{ code: string; changePercent: number }>,
) {
  const quoteMap = new Map(quotes.map((quote) => [quote.code, quote.changePercent]));
  let changeRate = new Decimal(0);
  let coverageRate = new Decimal(0);
  let matched = 0;
  for (const holding of holdings) {
    const changePercent = quoteMap.get(holding.code);
    if (changePercent === undefined) continue;
    const weight = new Decimal(holding.weightRate);
    coverageRate = coverageRate.plus(weight);
    changeRate = changeRate.plus(weight.mul(new Decimal(changePercent).div(100)));
    matched += 1;
  }
  if (matched === 0) throw new Error("公开持仓未匹配到盘中行情");
  return {
    estimatedChangeRate: changeRate.toFixed(8),
    holdingCoverageRate: coverageRate.toFixed(8),
    matchedHoldingCount: matched,
  };
}

async function fetchPublishedHoldings(fundCode: string) {
  const response = await fetch(
    `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${encodeURIComponent(fundCode)}&topline=10&year=&month=`,
    { headers: { "user-agent": "Mozilla/5.0", referer: "https://fundf10.eastmoney.com/" }, cache: "no-store" },
  );
  if (!response.ok) throw new Error(`持仓接口 HTTP ${response.status}`);
  const parsed = parsePublishedHoldings(await response.text());
  if (!parsed.holdings.length) throw new Error("没有可用于估算的公开股票持仓");
  return parsed;
}

async function fetchStockQuotes(holdings: Holding[]) {
  const response = await fetch(
    `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=f12,f14,f2,f3,f124&secids=${holdings.map((item) => item.secid).join(",")}`,
    { headers: { "user-agent": "Mozilla/5.0" }, cache: "no-store" },
  );
  if (!response.ok) throw new Error(`行情接口 HTTP ${response.status}`);
  const payload = await response.json() as {
    data?: { diff?: Array<{ f12?: string; f3?: number; f124?: number }> };
  };
  return (payload.data?.diff ?? [])
    .filter((item): item is { f12: string; f3: number; f124?: number } => typeof item.f12 === "string" && typeof item.f3 === "number")
    .map((item) => ({ code: item.f12, changePercent: item.f3, quoteTimestamp: item.f124 ?? null }));
}

function estimateTimeBucket(now = new Date()) {
  const { hour, minute } = shanghaiClock(now);
  return `${String(hour).padStart(2, "0")}:${minute < 30 ? "00" : "30"}`;
}

export async function syncIntradayEstimates(requestId: string, now = new Date()) {
  const database = ensureDatabase();
  const funds = database.select().from(instruments).orderBy(asc(instruments.code)).all();
  const estimateDate = shanghaiDate(now);
  const estimateTime = estimateTimeBucket(now);
  const synced: string[] = [];
  const failed: Array<{ code: string; error: string }> = [];

  for (const fund of funds) {
    try {
      const latestNav = database.select().from(fundNavs)
        .where(eq(fundNavs.instrumentId, fund.id))
        .orderBy(desc(fundNavs.navDate)).limit(1).get();
      if (!latestNav) throw new Error("缺少正式净值基准");
      const published = await fetchPublishedHoldings(fund.code);
      const quotes = await fetchStockQuotes(published.holdings);
      const currentQuotes = quotes.filter((quote) =>
        quote.quoteTimestamp && shanghaiDate(new Date(quote.quoteTimestamp * 1000)) === estimateDate
      );
      if (!currentQuotes.length) throw new Error("当前没有当日盘中行情，可能为非交易日或尚未开盘");
      const estimate = calculateHoldingEstimate(published.holdings, currentQuotes);
      const estimatedNav = new Decimal(latestNav.unitNav)
        .mul(new Decimal(1).plus(estimate.estimatedChangeRate));
      const fetchedAt = new Date().toISOString();
      runInTransaction((tx) => {
        tx.insert(intradayEstimates).values({
          id: crypto.randomUUID(),
          instrumentId: fund.id,
          estimateDate,
          estimateTime,
          estimatedNav: estimatedNav.toFixed(4),
          estimatedChangeRate: estimate.estimatedChangeRate,
          holdingCoverageRate: estimate.holdingCoverageRate,
          basisNavDate: latestNav.navDate,
          holdingDisclosureDate: published.disclosureDate,
          source: "EASTMONEY_DISCLOSED_HOLDINGS_WEIGHTED_QUOTES",
          fetchedAt,
          createdAt: fetchedAt,
        }).onConflictDoUpdate({
          target: [
            intradayEstimates.instrumentId,
            intradayEstimates.estimateDate,
            intradayEstimates.estimateTime,
          ],
          set: {
            estimatedNav: estimatedNav.toFixed(4),
            estimatedChangeRate: estimate.estimatedChangeRate,
            holdingCoverageRate: estimate.holdingCoverageRate,
            basisNavDate: latestNav.navDate,
            holdingDisclosureDate: published.disclosureDate,
            fetchedAt,
          },
        }).run();
        createAuditLog(tx, {
          operationType: "SYNC_INTRADAY_ESTIMATE",
          entityType: "INSTRUMENT",
          entityId: fund.id,
          requestId,
          detail: { estimateDate, estimateTime, ...estimate, holdingDisclosureDate: published.disclosureDate },
        });
      });
      synced.push(fund.code);
    } catch (error) {
      failed.push({ code: fund.code, error: error instanceof Error ? error.message : "未知错误" });
    }
  }
  return { estimateDate, estimateTime, synced, failed };
}

export function getTodayIntradayEstimates() {
  const database = ensureDatabase();
  const rows = database.select({
    estimate: intradayEstimates,
    fundCode: instruments.code,
    fundName: instruments.name,
  }).from(intradayEstimates)
    .innerJoin(instruments, eq(intradayEstimates.instrumentId, instruments.id))
    .where(eq(intradayEstimates.estimateDate, shanghaiDate()))
    .orderBy(asc(intradayEstimates.estimateTime), asc(instruments.code)).all();
  const openLots = database.select().from(positionLots)
    .where(eq(positionLots.status, "OPEN")).all();
  return rows.map((row) => {
    const shares = openLots
      .filter((lot) => lot.instrumentId === row.estimate.instrumentId)
      .reduce((sum, lot) => sum.plus(lot.remainingShares), new Decimal(0));
    return {
      ...row.estimate,
      fundCode: row.fundCode,
      fundName: row.fundName,
      estimatedMarketValue: shares.mul(row.estimate.estimatedNav).toFixed(2),
    };
  });
}
