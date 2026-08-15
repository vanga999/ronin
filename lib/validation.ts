import Decimal from "decimal.js";
import { z } from "zod";

export const decimalString = z.string().trim().min(1).refine(
  (value) => {
    try {
      return new Decimal(value).isFinite();
    } catch {
      return false;
    }
  },
  "必须是有效的十进制数",
);

export const positiveDecimalString = decimalString.refine(
  (value) => {
    try {
      return new Decimal(value).greaterThan(0);
    } catch {
      return false;
    }
  },
  "必须大于 0",
);

export const nonNegativeDecimalString = decimalString.refine(
  (value) => {
    try {
      return new Decimal(value).greaterThanOrEqualTo(0);
    } catch {
      return false;
    }
  },
  "不能小于 0",
);

export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD");

export const accountInput = z.object({
  name: z.string().trim().min(1).max(80),
});

export const accountUpdateInput = accountInput.extend({
  strategyId: z.string().uuid().optional(),
});

export const strategyInput = z.object({
  name: z.string().trim().min(1).max(80),
  firstTakeProfitRate: positiveDecimalString.refine((value) => new Decimal(value).lessThan(1), "比例必须小于 1"),
  firstTakeProfitRatio: positiveDecimalString.refine((value) => new Decimal(value).lessThanOrEqualTo(1), "比例不能超过 1"),
  secondTakeProfitRate: positiveDecimalString.refine((value) => new Decimal(value).lessThan(1), "比例必须小于 1"),
  drawdownTakeProfitRate: positiveDecimalString.refine((value) => new Decimal(value).lessThan(1), "比例必须小于 1"),
  warningLossRate: decimalString.refine((value) => new Decimal(value).isNegative(), "风险线必须为负数"),
  exitReviewLossRate: decimalString.refine((value) => new Decimal(value).isNegative(), "退出线必须为负数"),
  maxTotalCost: positiveDecimalString,
}).superRefine((value, context) => {
  if (new Decimal(value.secondTakeProfitRate).lessThanOrEqualTo(value.firstTakeProfitRate)) {
    context.addIssue({ code: "custom", path: ["secondTakeProfitRate"], message: "第二止盈线必须高于第一止盈线" });
  }
  if (new Decimal(value.exitReviewLossRate).greaterThanOrEqualTo(value.warningLossRate)) {
    context.addIssue({ code: "custom", path: ["exitReviewLossRate"], message: "退出评估线必须低于风险观察线" });
  }
});

export const instrumentInput = z.object({
  code: z.string().trim().regex(/^[0-9A-Za-z.-]{3,20}$/),
  name: z.string().trim().min(1).max(120),
  fundCompany: z.string().trim().max(120).optional().default(""),
  fundType: z.string().trim().max(60).optional().default(""),
  shareClass: z.enum(["A", "C", "OTHER"]).optional(),
  investmentTheme: z.string().trim().max(100).optional().default(""),
  riskLevel: z.string().trim().max(40).optional().default(""),
  dataSource: z.string().trim().max(80).optional().default(""),
});

export const lotInput = z.object({
  accountId: z.string().uuid(),
  instrumentId: z.string().uuid(),
  purchaseDate: dateString,
  purchaseAmount: positiveDecimalString,
  confirmedNav: positiveDecimalString,
  confirmedShares: positiveDecimalString,
  purchaseFee: z.preprocess(
    (value) => value === "" || value === null || value === undefined ? "0" : value,
    nonNegativeDecimalString,
  ),
});

export const redemptionInput = z.object({
  accountId: z.string().uuid(),
  instrumentId: z.string().uuid(),
  transactionDate: dateString,
  shares: positiveDecimalString,
  confirmedNav: positiveDecimalString,
  fee: z.preprocess(
    (value) => value === "" || value === null || value === undefined ? "0" : value,
    nonNegativeDecimalString,
  ),
  proceeds: z.preprocess(
    (value) => value === "" || value === null || value === undefined ? undefined : value,
    positiveDecimalString.optional(),
  ),
  note: z.string().trim().max(300).optional().default(""),
  signalId: z.string().uuid().optional(),
});

export function normalizeDecimal(value: string) {
  return new Decimal(value).toFixed();
}

export function validationError(error: z.ZodError) {
  return {
    error: "VALIDATION_ERROR",
    fields: error.flatten().fieldErrors,
  };
}
