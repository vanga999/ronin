import Decimal from "decimal.js";

export type StrategyConfig = {
  firstTakeProfitRate: string;
  firstTakeProfitRatio: string;
  secondTakeProfitRate: string;
  drawdownTakeProfitRate: string;
  warningLossRate: string;
  exitReviewLossRate: string;
  maxTotalCost: string;
};

export type StrategyDecision = {
  signalType:
    | "ALLOW_BUY"
    | "PAUSE_BUY"
    | "HOLD"
    | "TAKE_PROFIT_HALF"
    | "TAKE_PROFIT_ALL"
    | "EXIT_REVIEW";
  triggerReason: string;
  suggestedAction: string;
};

export function evaluateFund(returnRate: string, strategy: StrategyConfig): StrategyDecision {
  const rate = new Decimal(returnRate);
  if (rate.greaterThanOrEqualTo(strategy.secondTakeProfitRate)) {
    return {
      signalType: "TAKE_PROFIT_ALL",
      triggerReason: `收益率已达到第二止盈线 ${(Number(strategy.secondTakeProfitRate) * 100).toFixed(0)}%`,
      suggestedAction: "建议赎回剩余仓位，完成本轮止盈",
    };
  }
  if (rate.greaterThanOrEqualTo(strategy.firstTakeProfitRate)) {
    return {
      signalType: "TAKE_PROFIT_HALF",
      triggerReason: `收益率已达到第一止盈线 ${(Number(strategy.firstTakeProfitRate) * 100).toFixed(0)}%`,
      suggestedAction: `建议赎回 ${(Number(strategy.firstTakeProfitRatio) * 100).toFixed(0)}%，锁定部分利润`,
    };
  }
  if (rate.lessThanOrEqualTo(strategy.exitReviewLossRate)) {
    return {
      signalType: "EXIT_REVIEW",
      triggerReason: `收益率已触及退出评估线 ${(Number(strategy.exitReviewLossRate) * 100).toFixed(0)}%`,
      suggestedAction: "暂停追加，评估投资逻辑、资金期限与集中风险后决定是否退出",
    };
  }
  if (rate.lessThanOrEqualTo(strategy.warningLossRate)) {
    return {
      signalType: "PAUSE_BUY",
      triggerReason: `收益率已触及风险观察线 ${(Number(strategy.warningLossRate) * 100).toFixed(0)}%`,
      suggestedAction: "暂停追加，继续持有并观察；未触及退出评估线",
    };
  }
  return {
    signalType: "HOLD",
    triggerReason: "收益率未触及止盈线或风险线",
    suggestedAction: "继续持有，不因单日涨跌临时操作",
  };
}

export function evaluateAccount(input: {
  investedPrincipal: string;
  strategy: StrategyConfig;
  hasRiskWarning: boolean;
}): StrategyDecision & { remainingCapacity: string } {
  const invested = new Decimal(input.investedPrincipal);
  const cap = new Decimal(input.strategy.maxTotalCost);
  const remaining = Decimal.max(cap.minus(invested), 0);
  if (invested.greaterThanOrEqualTo(cap)) {
    return {
      signalType: "PAUSE_BUY",
      triggerReason: `当前总成本已达到固定上限 ¥${cap.toFixed(2)}`,
      suggestedAction: "停止继续投入，只执行持有或退出纪律",
      remainingCapacity: "0.00",
    };
  }
  if (input.hasRiskWarning) {
    return {
      signalType: "PAUSE_BUY",
      triggerReason: "账户内存在已触及风险观察线的基金",
      suggestedAction: "当前暂停追加；由你控制资金，但系统不建议扩大风险敞口",
      remainingCapacity: remaining.toFixed(2),
    };
  }
  return {
    signalType: "ALLOW_BUY",
    triggerReason: `总成本未超过 ¥${cap.toFixed(2)}，且当前没有风险警告`,
    suggestedAction: "允许继续投入，具体金额与时间由你决定",
    remainingCapacity: remaining.toFixed(2),
  };
}
