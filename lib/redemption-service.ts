import Decimal from "decimal.js";
import { and, asc, eq } from "drizzle-orm";
import { runInTransaction } from "@/db";
import { createAuditLog } from "@/db/audit";
import { accounts, instruments, positionLots, signals, strategyStates, transactions } from "@/db/schema";
import { createReviewIfClosed } from "./review-service";

export type RedemptionCommand = {
  accountId: string;
  instrumentId: string;
  transactionDate: string;
  shares: string;
  confirmedNav: string;
  fee: string;
  proceeds?: string;
  note?: string;
  signalId?: string;
};

export function allocateRedemptionFifo(
  lots: Array<{ id: string; remainingShares: string; remainingPrincipal: string }>,
  requestedSharesValue: string,
) {
  let remainingToAllocate = new Decimal(requestedSharesValue);
  const availableShares = lots.reduce((sum, lot) => sum.plus(lot.remainingShares), new Decimal(0));
  if (remainingToAllocate.greaterThan(availableShares)) {
    throw new Error(`赎回份额不能超过当前可用份额 ${availableShares.toFixed(4)}`);
  }
  let allocatedPrincipal = new Decimal(0);
  const allocations: Array<{
    lotId: string;
    shares: string;
    principal: string;
    nextShares: string;
    nextPrincipal: string;
  }> = [];
  for (const lot of lots) {
    if (remainingToAllocate.eq(0)) break;
    const lotShares = new Decimal(lot.remainingShares);
    const lotPrincipal = new Decimal(lot.remainingPrincipal);
    const usedShares = Decimal.min(lotShares, remainingToAllocate);
    const usedPrincipal = usedShares.eq(lotShares)
      ? lotPrincipal
      : lotPrincipal.mul(usedShares).div(lotShares);
    allocations.push({
      lotId: lot.id,
      shares: usedShares.toFixed(4),
      principal: usedPrincipal.toFixed(2),
      nextShares: lotShares.minus(usedShares).toFixed(4),
      nextPrincipal: lotPrincipal.minus(usedPrincipal).toFixed(2),
    });
    allocatedPrincipal = allocatedPrincipal.plus(usedPrincipal);
    remainingToAllocate = remainingToAllocate.minus(usedShares);
  }
  return {
    availableShares: availableShares.toFixed(4),
    allocatedPrincipal: allocatedPrincipal.toFixed(2),
    remainingShares: availableShares.minus(requestedSharesValue).toFixed(4),
    allocations,
  };
}

export function recordRedemption(input: RedemptionCommand, requestId: string) {
  return runInTransaction((tx) => {
    const account = tx.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
    const fund = tx.select().from(instruments).where(eq(instruments.id, input.instrumentId)).get();
    if (!account || !fund) throw new Error("账户或基金不存在");
    const lots = tx.select().from(positionLots).where(and(
      eq(positionLots.accountId, input.accountId),
      eq(positionLots.instrumentId, input.instrumentId),
      eq(positionLots.status, "OPEN"),
    )).orderBy(asc(positionLots.purchaseDate), asc(positionLots.createdAt)).all();
    const requestedShares = new Decimal(input.shares);
    const allocationResult = allocateRedemptionFifo(lots, input.shares);
    const availableShares = new Decimal(allocationResult.availableShares);
    const allocatedPrincipal = new Decimal(allocationResult.allocatedPrincipal);
    const allocations = allocationResult.allocations;
    const now = new Date().toISOString();
    for (const allocation of allocations) {
      const nextShares = new Decimal(allocation.nextShares);
      tx.update(positionLots).set({
        remainingShares: allocation.nextShares,
        remainingPrincipal: allocation.nextPrincipal,
        status: nextShares.eq(0) ? "CLOSED" : "OPEN",
        updatedAt: now,
      }).where(eq(positionLots.id, allocation.lotId)).run();
    }

    const fee = new Decimal(input.fee);
    const gross = requestedShares.mul(input.confirmedNav);
    const proceeds = input.proceeds ? new Decimal(input.proceeds) : gross.minus(fee);
    const realizedProfit = proceeds.minus(allocatedPrincipal);
    const transactionId = crypto.randomUUID();
    tx.insert(transactions).values({
      id: transactionId,
      accountId: input.accountId,
      instrumentId: input.instrumentId,
      transactionType: "REDEEM",
      transactionDate: input.transactionDate,
      amount: allocatedPrincipal.toFixed(2),
      nav: input.confirmedNav,
      shares: requestedShares.toFixed(4),
      fee: fee.toFixed(2),
      proceeds: proceeds.toFixed(2),
      realizedProfit: realizedProfit.toFixed(2),
      note: `${input.signalId ? "纪律信号执行；" : ""}${input.note ?? ""}`.replace(/；$/, ""),
      createdAt: now,
      updatedAt: now,
    }).run();

    if (input.signalId) {
      tx.update(signals).set({
        status: "EXECUTED",
        resolutionNote: `已登记赎回 ${requestedShares.toFixed(4)} 份`,
        resolvedAt: now,
        updatedAt: now,
      }).where(eq(signals.id, input.signalId)).run();
    }
    const remainingShares = availableShares.minus(requestedShares);
    const state = tx.select().from(strategyStates).where(and(
      eq(strategyStates.accountId, input.accountId),
      eq(strategyStates.instrumentId, input.instrumentId),
    )).get();
    const nextStage = remainingShares.eq(0) ? "CLOSED" : "FIRST_TAKE_PROFIT_EXECUTED";
    if (state) {
      tx.update(strategyStates).set({
        stage: nextStage,
        firstExecutedAt: state.firstExecutedAt ?? now,
        updatedAt: now,
      }).where(eq(strategyStates.id, state.id)).run();
    } else {
      tx.insert(strategyStates).values({
        id: crypto.randomUUID(),
        accountId: input.accountId,
        instrumentId: input.instrumentId,
        stage: nextStage,
        firstExecutedAt: now,
        createdAt: now,
        updatedAt: now,
      }).run();
    }
    const review = remainingShares.eq(0)
      ? createReviewIfClosed(tx, input.accountId, input.instrumentId, input.transactionDate)
      : null;
    createAuditLog(tx, {
      operationType: "RECORD_REDEMPTION",
      entityType: "FUND_TRANSACTION",
      entityId: transactionId,
      requestId,
      detail: {
        ...input,
        allocations,
        allocatedPrincipal: allocatedPrincipal.toFixed(2),
        proceeds: proceeds.toFixed(2),
        realizedProfit: realizedProfit.toFixed(2),
      },
    });
    return {
      transactionId,
      fundCode: fund.code,
      soldShares: requestedShares.toFixed(4),
      allocatedPrincipal: allocatedPrincipal.toFixed(2),
      proceeds: proceeds.toFixed(2),
      realizedProfit: realizedProfit.toFixed(2),
      remainingShares: remainingShares.toFixed(4),
      reviewCreated: Boolean(review),
    };
  });
}
