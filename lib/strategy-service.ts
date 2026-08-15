import Decimal from "decimal.js";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { ensureDatabase, runInTransaction } from "@/db";
import { createAuditLog } from "@/db/audit";
import {
  accounts,
  fundNavs,
  instruments,
  positionLots,
  signals,
  strategyStates,
  strategies,
} from "@/db/schema";
import { shanghaiDate } from "./date";
import { evaluateAccount, evaluateFund, type StrategyConfig } from "./strategy-engine";
import { DEFAULT_STRATEGY_ID, ensureDefaultStrategy } from "./default-strategy";

export function generateStrategySignals(requestId: string, signalDate = shanghaiDate()) {
  const database = ensureDatabase();
  const accountRows = database.select().from(accounts).orderBy(asc(accounts.createdAt)).all();
  let generated = 0;

  for (const account of accountRows) {
    const strategy = database.select().from(strategies)
      .where(eq(strategies.id, account.strategyId ?? DEFAULT_STRATEGY_ID)).get()
      ?? ensureDefaultStrategy(database, requestId);
    const config: StrategyConfig = {
      firstTakeProfitRate: strategy.firstTakeProfitRate,
      firstTakeProfitRatio: strategy.firstTakeProfitRatio,
      secondTakeProfitRate: strategy.secondTakeProfitRate,
      drawdownTakeProfitRate: strategy.drawdownTakeProfitRate,
      warningLossRate: strategy.warningLossRate,
      exitReviewLossRate: strategy.exitReviewLossRate,
      maxTotalCost: strategy.maxTotalCost,
    };
    const rows = database
      .select({ lot: positionLots, fund: instruments })
      .from(positionLots)
      .innerJoin(instruments, eq(positionLots.instrumentId, instruments.id))
      .where(and(eq(positionLots.accountId, account.id), eq(positionLots.status, "OPEN")))
      .all();
    const grouped = new Map<string, {
      fund: typeof instruments.$inferSelect;
      principal: Decimal;
      shares: Decimal;
    }>();
    for (const { lot, fund } of rows) {
      const current = grouped.get(fund.id) ?? {
        fund,
        principal: new Decimal(0),
        shares: new Decimal(0),
      };
      current.principal = current.principal.plus(lot.remainingPrincipal);
      current.shares = current.shares.plus(lot.remainingShares);
      grouped.set(fund.id, current);
    }

    const fundSignals: Array<{
      fund: typeof instruments.$inferSelect;
      latest: typeof fundNavs.$inferSelect;
      principal: Decimal;
      value: Decimal;
      profit: Decimal;
      returnRate: Decimal;
      decision: ReturnType<typeof evaluateFund>;
      state: typeof strategyStates.$inferSelect | undefined;
      nextPeakNav: string | null;
      nextPeakNavDate: string | null;
    }> = [];
    let totalPrincipal = new Decimal(0);
    let hasRiskWarning = false;
    for (const group of grouped.values()) {
      totalPrincipal = totalPrincipal.plus(group.principal);
      const latest = database.select().from(fundNavs)
        .where(eq(fundNavs.instrumentId, group.fund.id))
        .orderBy(desc(fundNavs.navDate))
        .limit(1).get();
      if (!latest) continue;
      const value = group.shares.mul(latest.unitNav);
      const profit = value.minus(group.principal);
      const returnRate = group.principal.eq(0) ? new Decimal(0) : profit.div(group.principal);
      let decision = evaluateFund(returnRate.toFixed(8), config);
      const state = database.select().from(strategyStates).where(and(
        eq(strategyStates.accountId, account.id),
        eq(strategyStates.instrumentId, group.fund.id),
      )).get();
      let nextPeakNav = state?.peakNav ?? null;
      let nextPeakNavDate = state?.peakNavDate ?? null;
      if (state?.stage === "FIRST_TAKE_PROFIT_EXECUTED") {
        const peak = new Decimal(state.peakNav ?? latest.unitNav);
        const currentNav = new Decimal(latest.unitNav);
        if (currentNav.greaterThan(peak)) {
          nextPeakNav = currentNav.toFixed();
          nextPeakNavDate = latest.navDate;
        }
        const effectivePeak = Decimal.max(peak, currentNav);
        const drawdown = currentNav.div(effectivePeak).minus(1);
        if (drawdown.lessThanOrEqualTo(new Decimal(config.drawdownTakeProfitRate).negated())) {
          decision = {
            signalType: "TAKE_PROFIT_ALL",
            triggerReason: `第一止盈后从最高净值回撤 ${(drawdown.abs().mul(100)).toFixed(2)}%，达到回撤止盈线`,
            suggestedAction: "建议赎回剩余仓位，完成回撤止盈",
          };
        } else if (decision.signalType === "TAKE_PROFIT_HALF") {
          decision = {
            signalType: "HOLD",
            triggerReason: "第一止盈已执行，正在跟踪剩余仓位最高净值与回撤",
            suggestedAction: "继续持有剩余仓位，等待第二止盈或回撤止盈",
          };
        }
      }
      if (decision.signalType === "PAUSE_BUY" || decision.signalType === "EXIT_REVIEW") {
        hasRiskWarning = true;
      }
      fundSignals.push({
        fund: group.fund,
        latest,
        principal: group.principal,
        value,
        profit,
        returnRate,
        decision,
        state,
        nextPeakNav,
        nextPeakNavDate,
      });
    }
    const accountDecision = evaluateAccount({
      investedPrincipal: totalPrincipal.toFixed(2),
      strategy: config,
      hasRiskWarning,
    });
    const now = new Date().toISOString();

    runInTransaction((tx) => {
      const strategySnapshotJson = JSON.stringify(config);
      tx.update(signals).set({ status: "EXPIRED", updatedAt: now }).where(and(
        eq(signals.accountId, account.id),
        eq(signals.status, "ACTIVE"),
        lt(signals.signalDate, signalDate),
      )).run();
      tx.insert(signals).values({
        id: crypto.randomUUID(),
        accountId: account.id,
        instrumentId: null,
        targetKey: `ACCOUNT:${account.id}`,
        signalDate,
        signalType: accountDecision.signalType,
        triggerReason: accountDecision.triggerReason,
        triggerMetricsJson: JSON.stringify({
          investedPrincipal: totalPrincipal.toFixed(2),
          maxTotalCost: config.maxTotalCost,
          remainingCapacity: accountDecision.remainingCapacity,
          hasRiskWarning,
        }),
        strategySnapshotJson,
        suggestedAction: accountDecision.suggestedAction,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [signals.accountId, signals.targetKey, signals.signalDate],
        set: {
          signalType: accountDecision.signalType,
          triggerReason: accountDecision.triggerReason,
          triggerMetricsJson: JSON.stringify({
            investedPrincipal: totalPrincipal.toFixed(2),
            maxTotalCost: config.maxTotalCost,
            remainingCapacity: accountDecision.remainingCapacity,
            hasRiskWarning,
          }),
          strategySnapshotJson,
          suggestedAction: accountDecision.suggestedAction,
          updatedAt: now,
        },
      }).run();
      generated += 1;

      for (const item of fundSignals) {
        if (item.state) {
          tx.update(strategyStates).set({
            stage: item.state.stage === "NORMAL" && item.decision.signalType === "TAKE_PROFIT_HALF"
              ? "FIRST_TAKE_PROFIT_TRIGGERED"
              : item.state.stage,
            firstTriggeredAt: item.state.firstTriggeredAt
              ?? (item.decision.signalType === "TAKE_PROFIT_HALF" ? now : null),
            peakNav: item.nextPeakNav,
            peakNavDate: item.nextPeakNavDate,
            updatedAt: now,
          }).where(eq(strategyStates.id, item.state.id)).run();
        } else {
          tx.insert(strategyStates).values({
            id: crypto.randomUUID(),
            accountId: account.id,
            instrumentId: item.fund.id,
            stage: item.decision.signalType === "TAKE_PROFIT_HALF"
              ? "FIRST_TAKE_PROFIT_TRIGGERED"
              : "NORMAL",
            firstTriggeredAt: item.decision.signalType === "TAKE_PROFIT_HALF" ? now : null,
            createdAt: now,
            updatedAt: now,
          }).run();
        }
        const metrics = {
          fundCode: item.fund.code,
          fundName: item.fund.name,
          navDate: item.latest.navDate,
          unitNav: item.latest.unitNav,
          investedPrincipal: item.principal.toFixed(2),
          marketValue: item.value.toFixed(2),
          profitAmount: item.profit.toFixed(2),
          returnRate: item.returnRate.toFixed(8),
        };
        tx.insert(signals).values({
          id: crypto.randomUUID(),
          accountId: account.id,
          instrumentId: item.fund.id,
          targetKey: `INSTRUMENT:${item.fund.id}`,
          signalDate,
          signalType: item.decision.signalType,
          triggerReason: item.decision.triggerReason,
          triggerMetricsJson: JSON.stringify(metrics),
          strategySnapshotJson,
          suggestedAction: item.decision.suggestedAction,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [signals.accountId, signals.targetKey, signals.signalDate],
          set: {
            signalType: item.decision.signalType,
            triggerReason: item.decision.triggerReason,
            triggerMetricsJson: JSON.stringify(metrics),
            strategySnapshotJson,
            suggestedAction: item.decision.suggestedAction,
            updatedAt: now,
          },
        }).run();
        generated += 1;
      }
      createAuditLog(tx, {
        operationType: "GENERATE_STRATEGY_SIGNALS",
        entityType: "FUND_ACCOUNT",
        entityId: account.id,
        requestId,
        detail: {
          signalDate,
          generated: fundSignals.length + 1,
          accountSignal: accountDecision.signalType,
        },
      });
    });
  }
  return generated;
}

export function getCurrentSignals(accountId?: string) {
  const database = ensureDatabase();
  const date = shanghaiDate();
  const rows = accountId
    ? database.select({
        signal: signals,
        fundCode: instruments.code,
        fundName: instruments.name,
      }).from(signals)
        .leftJoin(instruments, eq(signals.instrumentId, instruments.id))
        .where(and(eq(signals.accountId, accountId), eq(signals.signalDate, date)))
        .orderBy(asc(signals.targetKey)).all()
    : database.select({
        signal: signals,
        fundCode: instruments.code,
        fundName: instruments.name,
      }).from(signals)
        .leftJoin(instruments, eq(signals.instrumentId, instruments.id))
        .where(eq(signals.signalDate, date))
        .orderBy(asc(signals.targetKey)).all();
  return rows.map((row) => ({
    ...row.signal,
    fundCode: row.fundCode,
    fundName: row.fundName,
    triggerMetrics: JSON.parse(row.signal.triggerMetricsJson),
    strategySnapshot: JSON.parse(row.signal.strategySnapshotJson),
  }));
}

export function getRecentSignals() {
  return ensureDatabase().select({
    signal: signals,
    fundCode: instruments.code,
    fundName: instruments.name,
  }).from(signals)
    .leftJoin(instruments, eq(signals.instrumentId, instruments.id))
    .orderBy(desc(signals.signalDate), desc(signals.updatedAt))
    .all()
    .map((row) => ({
      ...row.signal,
      fundCode: row.fundCode,
      fundName: row.fundName,
      triggerMetrics: JSON.parse(row.signal.triggerMetricsJson),
    }));
}
