import { describe, expect, it } from "vitest";
import { allocateRedemptionFifo } from "@/lib/redemption-service";

describe("赎回 FIFO 成本分摊", () => {
  const lots = [
    { id: "lot-1", remainingShares: "100", remainingPrincipal: "1000" },
    { id: "lot-2", remainingShares: "200", remainingPrincipal: "3000" },
  ];

  it("部分赎回优先消耗最早批次", () => {
    const result = allocateRedemptionFifo(lots, "150");
    expect(result.allocatedPrincipal).toBe("1750.00");
    expect(result.remainingShares).toBe("150.0000");
    expect(result.allocations).toEqual([
      { lotId: "lot-1", shares: "100.0000", principal: "1000.00", nextShares: "0.0000", nextPrincipal: "0.00" },
      { lotId: "lot-2", shares: "50.0000", principal: "750.00", nextShares: "150.0000", nextPrincipal: "2250.00" },
    ]);
  });

  it("全部赎回时成本完全归零", () => {
    const result = allocateRedemptionFifo(lots, "300");
    expect(result.allocatedPrincipal).toBe("4000.00");
    expect(result.remainingShares).toBe("0.0000");
    expect(result.allocations.at(-1)?.nextPrincipal).toBe("0.00");
  });

  it("拒绝超过可用份额的赎回", () => {
    expect(() => allocateRedemptionFifo(lots, "301")).toThrow("不能超过当前可用份额");
  });
});
