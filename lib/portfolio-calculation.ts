import Decimal from "decimal.js";

export function calculateHoldingEfficiency(input: {
  purchaseDate: string;
  valuationDate: string;
  investedPrincipal: string;
  marketValue: string;
}) {
  const start = Date.parse(`${input.purchaseDate}T00:00:00Z`);
  const end = Date.parse(`${input.valuationDate}T00:00:00Z`);
  const holdingDays = Math.max(1, Math.floor((end - start) / 86_400_000));
  const principal = new Decimal(input.investedPrincipal);
  const value = new Decimal(input.marketValue);
  if (principal.lessThanOrEqualTo(0) || value.lessThanOrEqualTo(0)) {
    return {
      holdingDays,
      periodReturnRate: "0",
      dailyCompoundReturnRate: null,
      annualizedReturnRate: null,
    };
  }
  const valueRatio = value.div(principal);
  const periodReturnRate = valueRatio.minus(1);
  const dailyCompoundReturnRate = valueRatio
    .pow(new Decimal(1).div(holdingDays))
    .minus(1);
  const annualizedReturnRate = holdingDays >= 30
    ? valueRatio.pow(new Decimal(365).div(holdingDays)).minus(1)
    : null;
  return {
    holdingDays,
    periodReturnRate: periodReturnRate.toFixed(8),
    dailyCompoundReturnRate: dailyCompoundReturnRate.toFixed(8),
    annualizedReturnRate: annualizedReturnRate?.toFixed(8) ?? null,
  };
}

export function calculatePosition(input: {
  investedPrincipal: string;
  shares: string;
  latestNav: string;
  previousNav?: string | null;
}) {
  const principal = new Decimal(input.investedPrincipal);
  const shares = new Decimal(input.shares);
  const marketValue = shares.mul(input.latestNav);
  const profitAmount = marketValue.minus(principal);
  const returnRate = principal.eq(0) ? new Decimal(0) : profitAmount.div(principal);
  const dailyProfit = input.previousNav
    ? shares.mul(new Decimal(input.latestNav).minus(input.previousNav))
    : new Decimal(0);
  return {
    investedPrincipal: principal.toFixed(2),
    marketValue: marketValue.toFixed(2),
    profitAmount: profitAmount.toFixed(2),
    returnRate: returnRate.toFixed(8),
    dailyProfit: dailyProfit.toFixed(2),
  };
}
