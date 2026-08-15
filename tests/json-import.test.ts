import { describe, expect, it } from "vitest";
import { jsonPositionImportSchema } from "@/app/api/import/positions/route";

describe("screenshot JSON import contract", () => {
  it("accepts string financial values and defaults an omitted fee to zero", () => {
    const result = jsonPositionImportSchema.parse({
      version: "1.0",
      positions: [{
        fundCode: "001513",
        fundName: "易方达信息产业混合A",
        purchaseDate: "2026-07-01",
        purchaseAmount: "20000.00",
        confirmedNav: "3.2100",
        confirmedShares: "6230.5296",
      }],
    });
    expect(result.positions[0].purchaseFee).toBe("0");
  });

  it("rejects incomplete OCR output instead of partially importing it", () => {
    expect(jsonPositionImportSchema.safeParse({
      version: "1.0",
      positions: [{ fundCode: "001513" }],
    }).success).toBe(false);
  });
});
