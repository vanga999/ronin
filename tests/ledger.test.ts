import { describe, expect, it } from "vitest";
import { calculateLedger } from "@/lib/ledger";

describe("投资总账", () => {
  it("累计总盈亏包含持有、卖出和现金分红", () => {
    const ledger = calculateLedger([
      { transactionType: "SUBSCRIBE", amount: "10000", fee: "10", proceeds: null, realizedProfit: null },
      { transactionType: "REDEEM", amount: "4000", fee: "20", proceeds: "4500", realizedProfit: "500" },
      { transactionType: "DIVIDEND", amount: "100", fee: "0", proceeds: "100", realizedProfit: null },
    ], "6500", "500");
    expect(ledger.subscribedPrincipal).toBe("10000.00");
    expect(ledger.redemptionProceeds).toBe("4500.00");
    expect(ledger.realizedProfit).toBe("500.00");
    expect(ledger.cashDividends).toBe("100.00");
    expect(ledger.totalProfit).toBe("1100.00");
    expect(ledger.totalFees).toBe("30.00");
  });

  it("卖出亏损永久计入累计总盈亏", () => {
    const ledger = calculateLedger([
      { transactionType: "SUBSCRIBE", amount: "5000", fee: "0", proceeds: null, realizedProfit: null },
      { transactionType: "REDEEM", amount: "2000", fee: "10", proceeds: "1800", realizedProfit: "-200" },
    ], "2700", "-300");
    expect(ledger.realizedProfit).toBe("-200.00");
    expect(ledger.totalProfit).toBe("-500.00");
  });
});
