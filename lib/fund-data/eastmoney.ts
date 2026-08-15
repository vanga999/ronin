import { z } from "zod";
import type { FundDataProvider, FundNavRecord } from "./types";

const responseSchema = z.object({
  ErrCode: z.number(),
  ErrMsg: z.string().nullable().optional(),
  Data: z.object({
    LSJZList: z.array(z.object({
      FSRQ: z.string(),
      DWJZ: z.string(),
      LJJZ: z.string().optional().default(""),
      JZZZL: z.string().optional().default(""),
    })),
  }).nullable(),
});

export class EastMoneyFundDataProvider implements FundDataProvider {
  readonly name = "EASTMONEY";

  async getLatestNav(fundCode: string) {
    return (await this.getHistoryNav(fundCode, 1))[0] ?? null;
  }

  async getHistoryNav(fundCode: string, limit = 30): Promise<FundNavRecord[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const query = new URLSearchParams({
        fundCode,
        pageIndex: "1",
        pageSize: String(Math.min(Math.max(limit, 1), 500)),
        startDate: "",
        endDate: "",
      });
      const response = await fetch(`https://api.fund.eastmoney.com/f10/lsjz?${query}`, {
        headers: {
          accept: "application/json",
          referer: "https://fundf10.eastmoney.com/",
          "user-agent": "FundIntelligenceAssistant/1.0",
        },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`基金数据接口返回 ${response.status}`);
      const parsed = responseSchema.parse(await response.json());
      if (parsed.ErrCode !== 0 || !parsed.Data) {
        throw new Error(parsed.ErrMsg || `基金 ${fundCode} 暂无净值数据`);
      }
      return parsed.Data.LSJZList.map((item) => ({
        fundCode,
        navDate: item.FSRQ,
        unitNav: item.DWJZ,
        accumulatedNav: item.LJJZ || null,
        dailyChangeRate: item.JZZZL ? String(Number(item.JZZZL) / 100) : null,
        source: this.name,
        status: "OFFICIAL" as const,
      }));
    } finally {
      clearTimeout(timeout);
    }
  }
}
