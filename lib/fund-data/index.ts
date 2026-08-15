import type { FundDataProvider } from "./types";
import { EastMoneyFundDataProvider } from "./eastmoney";

export function getFundDataProvider(): FundDataProvider {
  return new EastMoneyFundDataProvider();
}

export type { FundDataProvider, FundNavRecord } from "./types";
