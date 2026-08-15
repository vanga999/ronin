import { afterEach, describe, expect, it, vi } from "vitest";
import { EastMoneyFundDataProvider } from "@/lib/fund-data/eastmoney";
import { calculatePosition } from "@/lib/portfolio-calculation";

afterEach(() => vi.restoreAllMocks());

describe("official fund NAV provider", () => {
  it("maps official NAV and percentage to decimal rate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      Data: {
        LSJZList: [{
          FSRQ: "2026-07-22",
          DWJZ: "8.7360",
          LJJZ: "8.8560",
          JZZZL: "-3.18",
        }],
      },
      ErrCode: 0,
      ErrMsg: null,
    }), { status: 200 })));

    const result = await new EastMoneyFundDataProvider().getLatestNav("001513");
    expect(result).toMatchObject({
      navDate: "2026-07-22",
      unitNav: "8.7360",
      dailyChangeRate: "-0.0318",
      status: "OFFICIAL",
    });
  });
});

describe("portfolio valuation", () => {
  it("calculates market value, cumulative profit and daily profit precisely", () => {
    expect(calculatePosition({
      investedPrincipal: "20000.00",
      shares: "6230.5296",
      latestNav: "3.5500",
      previousNav: "3.5000",
    })).toEqual({
      investedPrincipal: "20000.00",
      marketValue: "22118.38",
      profitAmount: "2118.38",
      returnRate: "0.10591900",
      dailyProfit: "311.53",
    });
  });
});
