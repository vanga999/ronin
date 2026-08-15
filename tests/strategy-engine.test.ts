import { describe, expect, it } from "vitest";
import { evaluateAccount, evaluateFund, type StrategyConfig } from "@/lib/strategy-engine";

const strategy: StrategyConfig = {
  firstTakeProfitRate: "0.10",
  firstTakeProfitRatio: "0.50",
  secondTakeProfitRate: "0.18",
  drawdownTakeProfitRate: "0.05",
  warningLossRate: "-0.08",
  exitReviewLossRate: "-0.15",
  maxTotalCost: "50000",
};

describe("fund discipline signals", () => {
  it.each([
    ["0.19", "TAKE_PROFIT_ALL"],
    ["0.10", "TAKE_PROFIT_HALF"],
    ["0.0667", "HOLD"],
    ["-0.1133", "PAUSE_BUY"],
    ["-0.15", "EXIT_REVIEW"],
  ])("maps return %s to %s", (rate, expected) => {
    expect(evaluateFund(rate, strategy).signalType).toBe(expected);
  });
});

describe("account cost cap", () => {
  it("allows user-controlled investment below the cap without risk warnings", () => {
    expect(evaluateAccount({
      investedPrincipal: "9000",
      strategy,
      hasRiskWarning: false,
    })).toMatchObject({ signalType: "ALLOW_BUY", remainingCapacity: "41000.00" });
  });

  it("pauses investment when any fund is under risk observation", () => {
    expect(evaluateAccount({
      investedPrincipal: "9000",
      strategy,
      hasRiskWarning: true,
    })).toMatchObject({ signalType: "PAUSE_BUY", remainingCapacity: "41000.00" });
  });

  it("stops investment when total cost reaches 50000", () => {
    expect(evaluateAccount({
      investedPrincipal: "50000",
      strategy,
      hasRiskWarning: false,
    })).toMatchObject({ signalType: "PAUSE_BUY", remainingCapacity: "0.00" });
  });
});
