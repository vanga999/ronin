import { eq } from "drizzle-orm";
import { createAuditLog } from "@/db/audit";
import type { DbClient } from "@/db";
import { strategies } from "@/db/schema";

export const DEFAULT_STRATEGY_ID = "00000000-0000-4000-8000-000000000001";

export function ensureDefaultStrategy(database: DbClient, requestId: string) {
  const existing = database.select().from(strategies)
    .where(eq(strategies.id, DEFAULT_STRATEGY_ID)).get();
  if (existing) {
    if (existing.name === "默认纪律策略") {
      database.update(strategies).set({
        name: "规则 A · 稳健纪律",
        updatedAt: new Date().toISOString(),
      }).where(eq(strategies.id, DEFAULT_STRATEGY_ID)).run();
      return { ...existing, name: "规则 A · 稳健纪律" };
    }
    return existing;
  }

  const now = new Date().toISOString();
  const strategy = {
    id: DEFAULT_STRATEGY_ID,
    name: "规则 A · 稳健纪律",
    firstTakeProfitRate: "0.10",
    firstTakeProfitRatio: "0.50",
    secondTakeProfitRate: "0.18",
    drawdownTakeProfitRate: "0.05",
    warningLossRate: "-0.08",
    exitReviewLossRate: "-0.15",
    maxTotalCost: "50000",
    locked: true,
    createdAt: now,
    updatedAt: now,
  };
  database.insert(strategies).values(strategy).run();
  createAuditLog(database, {
    operationType: "CREATE",
    entityType: "FUND_STRATEGY",
    entityId: strategy.id,
    requestId,
    detail: strategy,
  });
  return strategy;
}
