import * as XLSX from "xlsx";
import { asc, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureDatabase } from "@/db";
import {
  accounts,
  dailySnapshots,
  fundNavs,
  instruments,
  positionLots,
  reviews,
  signals,
  transactions,
} from "@/db/schema";
import { errorResponse } from "@/lib/http";
import Decimal from "decimal.js";

export const runtime = "nodejs";

type ExportType = "transactions" | "lots" | "daily-snapshots" | "signals" | "reviews";
type ExportFormat = "xlsx" | "csv";

const signalTypeLabels: Record<string, string> = {
  ALLOW_BUY: "允许买入",
  PAUSE_BUY: "暂停买入",
  HOLD: "继续持有",
  TAKE_PROFIT_HALF: "止盈赎回50%",
  TAKE_PROFIT_ALL: "止盈清仓",
  EXIT_REVIEW: "退出评估",
};

const signalStatusLabels: Record<string, string> = {
  ACTIVE: "待处理",
  ACKNOWLEDGED: "已阅读",
  EXECUTED: "已执行",
  DISMISSED: "已忽略",
  EXPIRED: "已过期",
};

const transactionTypeLabels: Record<string, string> = {
  SUBSCRIBE: "申购",
  REDEEM: "赎回",
  DIVIDEND: "现金分红",
  REINVEST: "红利再投",
  ADJUSTMENT: "调整",
};

function toCsv(rows: Record<string, string | number | null>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (value: string | number | null) => {
    const str = value === null || value === undefined ? "" : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const headerLine = headers.join(",");
  const dataLines = rows.map((row) => headers.map((h) => escape(row[h])).join(","));
  return "\uFEFF" + [headerLine, ...dataLines].join("\n");
}

function buildTransactionsExport() {
  const database = ensureDatabase();
  const rows = database
    .select({
      transactionDate: transactions.transactionDate,
      fundCode: instruments.code,
      fundName: instruments.name,
      accountName: accounts.name,
      transactionType: transactions.transactionType,
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
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
    .all();

  return rows.map((row) => ({
    "交易日期": row.transactionDate,
    "基金代码": row.fundCode,
    "基金名称": row.fundName,
    "账户": row.accountName,
    "类型": transactionTypeLabels[row.transactionType] ?? row.transactionType,
    "交易金额": row.amount ?? "",
    "成交净值": row.nav ?? "",
    "份额": row.shares ?? "",
    "费用": row.fee ?? "0",
    "实际到账": row.proceeds ?? "",
    "已实现盈亏": row.realizedProfit ?? "",
    "备注": row.note ?? "",
  }));
}

function buildLotsExport() {
  const database = ensureDatabase();
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

  return lots.map((lot) => {
    const latestNav = database
      .select({ unitNav: fundNavs.unitNav, navDate: fundNavs.navDate })
      .from(fundNavs)
      .where(eq(fundNavs.instrumentId, lot.instrumentId))
      .orderBy(desc(fundNavs.navDate))
      .limit(1)
      .get();

    let marketValue = "";
    let profitAmount = "";
    let returnRate = "";

    if (latestNav) {
      const mv = new Decimal(lot.remainingShares).mul(latestNav.unitNav);
      const profit = mv.minus(lot.remainingPrincipal);
      marketValue = mv.toFixed(2);
      profitAmount = profit.toFixed(2);
      returnRate = new Decimal(lot.remainingPrincipal).eq(0)
        ? "0.00%"
        : `${profit.div(lot.remainingPrincipal).mul(100).toFixed(2)}%`;
    }

    return {
      "基金代码": lot.fundCode,
      "基金名称": lot.fundName,
      "账户": lot.accountName,
      "买入日期": lot.purchaseDate,
      "买入金额": lot.purchaseAmount,
      "买入净值": lot.confirmedNav,
      "买入份额": lot.confirmedShares,
      "剩余份额": lot.remainingShares,
      "剩余成本": lot.remainingPrincipal,
      "申购费用": lot.purchaseFee,
      "最新净值": latestNav?.unitNav ?? "",
      "净值日期": latestNav?.navDate ?? "",
      "当前市值": marketValue,
      "持有盈亏": profitAmount,
      "收益率": returnRate,
      "状态": lot.status === "OPEN" ? "开放" : "已关闭",
    };
  });
}

function buildDailySnapshotsExport() {
  const database = ensureDatabase();
  const rows = database
    .select({
      snapshotDate: dailySnapshots.snapshotDate,
      accountName: accounts.name,
      investedPrincipal: dailySnapshots.investedPrincipal,
      marketValue: dailySnapshots.marketValue,
      profitAmount: dailySnapshots.profitAmount,
      returnRate: dailySnapshots.returnRate,
      dailyProfit: dailySnapshots.dailyProfit,
    })
    .from(dailySnapshots)
    .innerJoin(accounts, eq(dailySnapshots.accountId, accounts.id))
    .orderBy(asc(dailySnapshots.snapshotDate))
    .all();

  return rows.map((row) => ({
    "日期": row.snapshotDate,
    "账户": row.accountName,
    "投入本金": row.investedPrincipal,
    "市值": row.marketValue,
    "持有盈亏": row.profitAmount,
    "收益率": `${(Number(row.returnRate) * 100).toFixed(2)}%`,
    "昨日收益": row.dailyProfit,
  }));
}

function buildSignalsExport() {
  const database = ensureDatabase();
  const rows = database
    .select({
      signalDate: signals.signalDate,
      fundCode: instruments.code,
      fundName: instruments.name,
      accountName: accounts.name,
      signalType: signals.signalType,
      signalStatus: signals.status,
      triggerReason: signals.triggerReason,
      suggestedAction: signals.suggestedAction,
      resolutionNote: signals.resolutionNote,
    })
    .from(signals)
    .innerJoin(accounts, eq(signals.accountId, accounts.id))
    .leftJoin(instruments, eq(signals.instrumentId, instruments.id))
    .orderBy(desc(signals.signalDate))
    .all();

  return rows.map((row) => ({
    "信号日期": row.signalDate,
    "基金代码": row.fundCode ?? "账户总盘",
    "基金名称": row.fundName ?? "ACCOUNT",
    "账户": row.accountName,
    "信号类型": signalTypeLabels[row.signalType] ?? row.signalType,
    "建议操作": row.suggestedAction,
    "触发原因": row.triggerReason,
    "处理状态": signalStatusLabels[row.signalStatus] ?? row.signalStatus,
    "备注": row.resolutionNote ?? "",
  }));
}

function buildReviewsExport() {
  const database = ensureDatabase();
  const rows = database
    .select({
      fundCode: instruments.code,
      fundName: instruments.name,
      accountName: accounts.name,
      startDate: reviews.startDate,
      endDate: reviews.endDate,
      investedPrincipal: reviews.investedPrincipal,
      proceeds: reviews.proceeds,
      realizedProfit: reviews.realizedProfit,
      returnRate: reviews.returnRate,
      holdingDays: reviews.holdingDays,
      maxReturnRate: reviews.maxReturnRate,
      maxDrawdownRate: reviews.maxDrawdownRate,
      disciplineScore: reviews.disciplineScore,
    })
    .from(reviews)
    .innerJoin(accounts, eq(reviews.accountId, accounts.id))
    .innerJoin(instruments, eq(reviews.instrumentId, instruments.id))
    .orderBy(desc(reviews.endDate))
    .all();

  return rows.map((row) => ({
    "基金代码": row.fundCode,
    "基金名称": row.fundName,
    "账户": row.accountName,
    "开始日期": row.startDate,
    "结束日期": row.endDate,
    "投入本金": row.investedPrincipal,
    "赎回到账": row.proceeds,
    "已实现盈亏": row.realizedProfit,
    "收益率": `${(Number(row.returnRate) * 100).toFixed(2)}%`,
    "持有天数": row.holdingDays,
    "最大收益": row.maxReturnRate ? `${(Number(row.maxReturnRate) * 100).toFixed(2)}%` : "",
    "最大回撤": row.maxDrawdownRate ? `${(Number(row.maxDrawdownRate) * 100).toFixed(2)}%` : "",
    "纪律评分": row.disciplineScore,
  }));
}

const exporters: Record<ExportType, () => Record<string, string | number | null>[]> = {
  transactions: buildTransactionsExport,
  lots: buildLotsExport,
  "daily-snapshots": buildDailySnapshotsExport,
  signals: buildSignalsExport,
  reviews: buildReviewsExport,
};

const fileNames: Record<ExportType, string> = {
  transactions: "交易流水",
  lots: "持仓批次",
  "daily-snapshots": "每日快照",
  signals: "纪律信号",
  reviews: "投资复盘",
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") as ExportType | null;
    const format = (url.searchParams.get("format") ?? "xlsx") as ExportFormat;

    if (!type || !(type in exporters)) {
      return NextResponse.json(
        { error: "请指定导出类型：transactions, lots, daily-snapshots, signals, reviews" },
        { status: 400 },
      );
    }

    if (format !== "xlsx" && format !== "csv") {
      return NextResponse.json({ error: "格式只支持 xlsx 或 csv" }, { status: 400 });
    }

    const rows = exporters[type]();
    const date = new Date().toISOString().slice(0, 10);
    const baseName = `${fileNames[type]}-${date}`;

    if (format === "csv") {
      const csv = toCsv(rows);
      return new NextResponse(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${baseName}.csv"`,
        },
      });
    }

    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, fileNames[type]);
    const body = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(body, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${baseName}.xlsx"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
