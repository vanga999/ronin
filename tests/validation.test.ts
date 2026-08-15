import { describe, expect, it } from "vitest";
import { accountInput, lotInput, normalizeDecimal } from "@/lib/validation";

describe("decimal validation", () => {
  it("normalizes decimal strings without floating point conversion", () => {
    expect(normalizeDecimal("20000.0000")).toBe("20000");
    expect(normalizeDecimal("3.2100")).toBe("3.21");
  });

  it("requires only a non-empty account name", () => {
    expect(accountInput.safeParse({ name: "" }).success).toBe(false);
    expect(accountInput.safeParse({ name: "测试账户" }).success).toBe(true);
  });

  it("accepts a precise position lot", () => {
    expect(lotInput.safeParse({
      accountId: "e5fabaf1-3a4c-4b85-9b90-2d6cece09a8b",
      instrumentId: "a1ef52d6-d9ef-4715-a497-b4e388c51650",
      purchaseDate: "2026-07-23",
      purchaseAmount: "20000.00",
      confirmedNav: "3.2100",
      confirmedShares: "6230.5296",
      purchaseFee: "0",
    }).success).toBe(true);
  });

  it("normalizes an empty optional purchase fee to zero", () => {
    const result = lotInput.parse({
      accountId: "e5fabaf1-3a4c-4b85-9b90-2d6cece09a8b",
      instrumentId: "a1ef52d6-d9ef-4715-a497-b4e388c51650",
      purchaseDate: "2026-07-23",
      purchaseAmount: "20000.00",
      confirmedNav: "3.2100",
      confirmedShares: "6230.5296",
      purchaseFee: "",
    });
    expect(result.purchaseFee).toBe("0");
  });
});
