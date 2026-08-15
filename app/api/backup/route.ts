import { NextResponse } from "next/server";
import { ensureDatabase, runInTransaction } from "@/db";
import {
  accounts,
  dailySnapshots,
  fundNavs,
  instruments,
  intradayEstimates,
  operationLogs,
  positionLots,
  reviews,
  signals,
  strategies,
  strategyStates,
  transactions,
} from "@/db/schema";
import { errorResponse } from "@/lib/http";

export const runtime = "nodejs";

type BackupData = {
  version: 1;
  exportedAt: string;
  strategies: Array<typeof strategies.$inferSelect>;
  accounts: Array<typeof accounts.$inferSelect>;
  instruments: Array<typeof instruments.$inferSelect>;
  fundNavs: Array<typeof fundNavs.$inferSelect>;
  intradayEstimates: Array<typeof intradayEstimates.$inferSelect>;
  positionLots: Array<typeof positionLots.$inferSelect>;
  transactions: Array<typeof transactions.$inferSelect>;
  dailySnapshots: Array<typeof dailySnapshots.$inferSelect>;
  signals: Array<typeof signals.$inferSelect>;
  strategyStates: Array<typeof strategyStates.$inferSelect>;
  reviews: Array<typeof reviews.$inferSelect>;
  operationLogs: Array<typeof operationLogs.$inferSelect>;
};

export async function GET() {
  const database = ensureDatabase();
  const backup: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    strategies: database.select().from(strategies).all(),
    accounts: database.select().from(accounts).all(),
    instruments: database.select().from(instruments).all(),
    fundNavs: database.select().from(fundNavs).all(),
    intradayEstimates: database.select().from(intradayEstimates).all(),
    positionLots: database.select().from(positionLots).all(),
    transactions: database.select().from(transactions).all(),
    dailySnapshots: database.select().from(dailySnapshots).all(),
    signals: database.select().from(signals).all(),
    strategyStates: database.select().from(strategyStates).all(),
    reviews: database.select().from(reviews).all(),
    operationLogs: database.select().from(operationLogs).all(),
  };
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(backup, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="fund-assistant-backup-${date}.json"`,
    },
  });
}

export async function POST(request: Request) {
  try {
    const data = await request.json() as BackupData;
    if (data.version !== 1 || !Array.isArray(data.accounts) || !Array.isArray(data.positionLots)) {
      throw new Error("不是有效的基金助手 V1 备份文件");
    }
    runInTransaction((tx) => {
      tx.delete(reviews).run();
      tx.delete(strategyStates).run();
      tx.delete(signals).run();
      tx.delete(dailySnapshots).run();
      tx.delete(transactions).run();
      tx.delete(positionLots).run();
      tx.delete(intradayEstimates).run();
      tx.delete(fundNavs).run();
      tx.delete(operationLogs).run();
      tx.delete(accounts).run();
      tx.delete(instruments).run();
      tx.delete(strategies).run();
      if (data.strategies.length) tx.insert(strategies).values(data.strategies).run();
      if (data.accounts.length) tx.insert(accounts).values(data.accounts).run();
      if (data.instruments.length) tx.insert(instruments).values(data.instruments).run();
      if (data.fundNavs.length) tx.insert(fundNavs).values(data.fundNavs).run();
      if (data.intradayEstimates?.length) tx.insert(intradayEstimates).values(data.intradayEstimates).run();
      if (data.positionLots.length) tx.insert(positionLots).values(data.positionLots).run();
      if (data.transactions.length) tx.insert(transactions).values(data.transactions).run();
      if (data.dailySnapshots.length) tx.insert(dailySnapshots).values(data.dailySnapshots).run();
      if (data.signals.length) tx.insert(signals).values(data.signals).run();
      if (data.strategyStates.length) tx.insert(strategyStates).values(data.strategyStates).run();
      if (data.reviews.length) tx.insert(reviews).values(data.reviews).run();
      if (data.operationLogs.length) tx.insert(operationLogs).values(data.operationLogs).run();
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
