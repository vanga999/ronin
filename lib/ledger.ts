import Decimal from "decimal.js";

export type LedgerTransaction = {
  transactionType: "SUBSCRIBE" | "REDEEM" | "DIVIDEND" | "REINVEST" | "ADJUSTMENT";
  amount: string | null;
  fee: string;
  proceeds: string | null;
  realizedProfit: string | null;
};

export function calculateLedger(
  transactions: LedgerTransaction[],
  holdingMarketValue: string,
  holdingProfit: string,
) {
  let subscribedPrincipal = new Decimal(0);
  let redemptionProceeds = new Decimal(0);
  let redeemedPrincipal = new Decimal(0);
  let realizedProfit = new Decimal(0);
  let cashDividends = new Decimal(0);
  let totalFees = new Decimal(0);

  for (const transaction of transactions) {
    totalFees = totalFees.plus(transaction.fee || 0);
    if (transaction.transactionType === "SUBSCRIBE") {
      subscribedPrincipal = subscribedPrincipal.plus(transaction.amount ?? 0);
    } else if (transaction.transactionType === "REDEEM") {
      redemptionProceeds = redemptionProceeds.plus(transaction.proceeds ?? 0);
      redeemedPrincipal = redeemedPrincipal.plus(transaction.amount ?? 0);
      realizedProfit = realizedProfit.plus(transaction.realizedProfit ?? 0);
    } else if (transaction.transactionType === "DIVIDEND") {
      cashDividends = cashDividends.plus(transaction.proceeds ?? transaction.amount ?? 0);
    }
  }

  const floatingProfit = new Decimal(holdingProfit);
  const totalProfit = floatingProfit.plus(realizedProfit).plus(cashDividends);
  const totalReturnRate = subscribedPrincipal.eq(0)
    ? new Decimal(0)
    : totalProfit.div(subscribedPrincipal);
  return {
    subscribedPrincipal: subscribedPrincipal.toFixed(2),
    redeemedPrincipal: redeemedPrincipal.toFixed(2),
    redemptionProceeds: redemptionProceeds.toFixed(2),
    holdingMarketValue: new Decimal(holdingMarketValue).toFixed(2),
    floatingProfit: floatingProfit.toFixed(2),
    realizedProfit: realizedProfit.toFixed(2),
    cashDividends: cashDividends.toFixed(2),
    totalFees: totalFees.toFixed(2),
    totalProfit: totalProfit.toFixed(2),
    totalReturnRate: totalReturnRate.toFixed(8),
  };
}
