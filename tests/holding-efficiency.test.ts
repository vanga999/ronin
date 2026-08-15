import { describe, expect, it } from "vitest";
import { calculateHoldingEfficiency } from "@/lib/portfolio-calculation";

describe("持仓时间与收益效率", () => {
  it("以正式净值日期而不是系统日期计算持有天数", () => {
    const result = calculateHoldingEfficiency({
      purchaseDate: "2026-07-08",
      valuationDate: "2026-07-23",
      investedPrincipal: "5000",
      marketValue: "4331.85",
    });
    expect(result.holdingDays).toBe(15);
    expect(result.periodReturnRate).toBe("-0.13363000");
    expect(result.dailyCompoundReturnRate).not.toBeNull();
  });

  it("不足30天不展示年化收益率", () => {
    const result = calculateHoldingEfficiency({
      purchaseDate: "2026-07-17",
      valuationDate: "2026-07-23",
      investedPrincipal: "4000",
      marketValue: "4054.47",
    });
    expect(result.holdingDays).toBe(6);
    expect(result.annualizedReturnRate).toBeNull();
  });

  it("满30天后计算年化复合收益率", () => {
    const result = calculateHoldingEfficiency({
      purchaseDate: "2026-01-01",
      valuationDate: "2026-07-01",
      investedPrincipal: "10000",
      marketValue: "11000",
    });
    expect(result.holdingDays).toBe(181);
    expect(Number(result.annualizedReturnRate)).toBeGreaterThan(0.2);
  });
});
