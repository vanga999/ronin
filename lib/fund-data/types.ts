export type FundNavRecord = {
  fundCode: string;
  navDate: string;
  unitNav: string;
  accumulatedNav: string | null;
  dailyChangeRate: string | null;
  source: string;
  status: "OFFICIAL" | "ESTIMATED";
};

export interface FundDataProvider {
  readonly name: string;
  getLatestNav(fundCode: string): Promise<FundNavRecord | null>;
  getHistoryNav(fundCode: string, limit?: number): Promise<FundNavRecord[]>;
}
