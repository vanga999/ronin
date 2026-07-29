import { describe, expect, it } from "vitest";
import { calculateHoldingEstimate, parsePublishedHoldings } from "@/lib/intraday-estimate";
import { isIntradayWindow } from "@/lib/scheduler";

describe("盘中持仓趋势估算", () => {
  it("解析公开持仓代码、权重和披露日期", () => {
    const source = "截止至：<font class='px12'>2026-06-30</font><tr><td><a href='//quote.eastmoney.com/unify/r/0.300502'>300502</a></td><td class='xglj'><a class='red'>详情</a></td><td class='tor'>6.09%</td></tr>";
    expect(parsePublishedHoldings(source)).toEqual({
      disclosureDate: "2026-06-30",
      holdings: [{ secid: "0.300502", code: "300502", weightRate: "0.06090000" }],
    });
  });

  it("按基金净值占比加权，不把未披露资产假装成已知", () => {
    const result = calculateHoldingEstimate([
      { secid: "0.000001", code: "000001", weightRate: "0.10" },
      { secid: "1.600000", code: "600000", weightRate: "0.20" },
    ], [
      { code: "000001", changePercent: 2 },
      { code: "600000", changePercent: -1 },
    ]);
    expect(result.estimatedChangeRate).toBe("0.00000000");
    expect(result.holdingCoverageRate).toBe("0.30000000");
  });

  it("只在沪深交易时段内运行", () => {
    expect(isIntradayWindow(new Date("2026-07-28T02:00:00Z"))).toBe(true);
    expect(isIntradayWindow(new Date("2026-07-28T04:00:00Z"))).toBe(false);
    expect(isIntradayWindow(new Date("2026-07-26T02:00:00Z"))).toBe(false);
  });
});
