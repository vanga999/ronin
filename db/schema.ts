import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const strategies = sqliteTable("fund_strategy", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  firstTakeProfitRate: text("first_take_profit_rate").notNull(),
  firstTakeProfitRatio: text("first_take_profit_ratio").notNull(),
  secondTakeProfitRate: text("second_take_profit_rate").notNull(),
  drawdownTakeProfitRate: text("drawdown_take_profit_rate").notNull(),
  warningLossRate: text("warning_loss_rate").notNull(),
  exitReviewLossRate: text("exit_review_loss_rate").notNull(),
  maxTotalCost: text("max_total_cost").notNull().default("50000"),
  locked: integer("locked", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

export const accounts = sqliteTable("fund_account", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  strategyId: text("strategy_id").references(() => strategies.id),
  ...timestamps,
});

export const instruments = sqliteTable(
  "instrument",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    instrumentType: text("instrument_type", { enum: ["MUTUAL_FUND", "ETF"] })
      .notNull()
      .default("MUTUAL_FUND"),
    fundCompany: text("fund_company"),
    fundType: text("fund_type"),
    shareClass: text("share_class", { enum: ["A", "C", "OTHER"] }),
    investmentTheme: text("investment_theme"),
    riskLevel: text("risk_level"),
    dataSource: text("data_source"),
    ...timestamps,
  },
  (table) => [uniqueIndex("instrument_code_type_uq").on(table.code, table.instrumentType)],
);

export const fundNavs = sqliteTable(
  "fund_nav",
  {
    id: text("id").primaryKey(),
    instrumentId: text("instrument_id").notNull().references(() => instruments.id),
    navDate: text("nav_date").notNull(),
    unitNav: text("unit_nav").notNull(),
    accumulatedNav: text("accumulated_nav"),
    dailyChangeRate: text("daily_change_rate"),
    source: text("source").notNull(),
    dataStatus: text("data_status", { enum: ["OFFICIAL", "ESTIMATED"] })
      .notNull()
      .default("OFFICIAL"),
    fetchedAt: text("fetched_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("fund_nav_instrument_date_uq").on(table.instrumentId, table.navDate),
    index("fund_nav_date_idx").on(table.navDate),
  ],
);

export const intradayEstimates = sqliteTable(
  "fund_intraday_estimate",
  {
    id: text("id").primaryKey(),
    instrumentId: text("instrument_id").notNull().references(() => instruments.id),
    estimateDate: text("estimate_date").notNull(),
    estimateTime: text("estimate_time").notNull(),
    estimatedNav: text("estimated_nav").notNull(),
    estimatedChangeRate: text("estimated_change_rate").notNull(),
    holdingCoverageRate: text("holding_coverage_rate").notNull(),
    basisNavDate: text("basis_nav_date").notNull(),
    holdingDisclosureDate: text("holding_disclosure_date"),
    source: text("source").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("intraday_estimate_instrument_time_uq").on(
      table.instrumentId,
      table.estimateDate,
      table.estimateTime,
    ),
    index("intraday_estimate_date_idx").on(table.estimateDate),
  ],
);

export const positionLots = sqliteTable(
  "position_lot",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull().references(() => accounts.id),
    instrumentId: text("instrument_id").notNull().references(() => instruments.id),
    purchaseDate: text("purchase_date").notNull(),
    purchaseAmount: text("purchase_amount").notNull(),
    confirmedNav: text("confirmed_nav").notNull(),
    confirmedShares: text("confirmed_shares").notNull(),
    remainingShares: text("remaining_shares").notNull(),
    remainingPrincipal: text("remaining_principal").notNull().default("0"),
    purchaseFee: text("purchase_fee").notNull().default("0"),
    status: text("status", { enum: ["OPEN", "CLOSED"] }).notNull().default("OPEN"),
    ...timestamps,
  },
  (table) => [
    index("position_lot_account_idx").on(table.accountId),
    index("position_lot_instrument_idx").on(table.instrumentId),
  ],
);

export const transactions = sqliteTable(
  "fund_transaction",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull().references(() => accounts.id),
    instrumentId: text("instrument_id").notNull().references(() => instruments.id),
    lotId: text("lot_id").references(() => positionLots.id),
    transactionType: text("transaction_type", {
      enum: ["SUBSCRIBE", "REDEEM", "DIVIDEND", "REINVEST", "ADJUSTMENT"],
    }).notNull(),
    transactionDate: text("transaction_date").notNull(),
    amount: text("amount"),
    nav: text("nav"),
    shares: text("shares"),
    fee: text("fee").notNull().default("0"),
    proceeds: text("proceeds"),
    realizedProfit: text("realized_profit"),
    note: text("note"),
    ...timestamps,
  },
  (table) => [
    index("transaction_account_idx").on(table.accountId),
    index("transaction_instrument_idx").on(table.instrumentId),
  ],
);

export const operationLogs = sqliteTable(
  "operation_log",
  {
    id: text("id").primaryKey(),
    operationType: text("operation_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    requestId: text("request_id").notNull(),
    detailJson: text("detail_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("operation_log_entity_idx").on(table.entityType, table.entityId),
    index("operation_log_request_idx").on(table.requestId),
  ],
);

export const dailySnapshots = sqliteTable(
  "fund_daily_snapshot",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull().references(() => accounts.id),
    snapshotDate: text("snapshot_date").notNull(),
    investedPrincipal: text("invested_principal").notNull(),
    marketValue: text("market_value").notNull(),
    profitAmount: text("profit_amount").notNull(),
    returnRate: text("return_rate").notNull(),
    dailyProfit: text("daily_profit").notNull(),
    staleFundCount: integer("stale_fund_count").notNull().default(0),
    reportJson: text("report_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("daily_snapshot_account_date_uq").on(table.accountId, table.snapshotDate),
    index("daily_snapshot_date_idx").on(table.snapshotDate),
  ],
);

export const signals = sqliteTable(
  "fund_signal",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull().references(() => accounts.id),
    instrumentId: text("instrument_id").references(() => instruments.id),
    targetKey: text("target_key").notNull(),
    signalDate: text("signal_date").notNull(),
    signalType: text("signal_type", {
      enum: [
        "ALLOW_BUY",
        "PAUSE_BUY",
        "HOLD",
        "TAKE_PROFIT_HALF",
        "TAKE_PROFIT_ALL",
        "EXIT_REVIEW",
      ],
    }).notNull(),
    triggerReason: text("trigger_reason").notNull(),
    triggerMetricsJson: text("trigger_metrics_json").notNull(),
    strategySnapshotJson: text("strategy_snapshot_json").notNull(),
    suggestedAction: text("suggested_action").notNull(),
    status: text("status", { enum: ["ACTIVE", "ACKNOWLEDGED", "EXECUTED", "DISMISSED", "EXPIRED"] })
      .notNull()
      .default("ACTIVE"),
    resolutionNote: text("resolution_note"),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("fund_signal_target_date_uq").on(table.accountId, table.targetKey, table.signalDate),
    index("fund_signal_date_idx").on(table.signalDate),
    index("fund_signal_instrument_idx").on(table.instrumentId),
  ],
);

export const strategyStates = sqliteTable(
  "fund_strategy_state",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull().references(() => accounts.id),
    instrumentId: text("instrument_id").notNull().references(() => instruments.id),
    stage: text("stage", {
      enum: ["NORMAL", "FIRST_TAKE_PROFIT_TRIGGERED", "FIRST_TAKE_PROFIT_EXECUTED", "CLOSED"],
    }).notNull().default("NORMAL"),
    firstTriggeredAt: text("first_triggered_at"),
    firstExecutedAt: text("first_executed_at"),
    peakNav: text("peak_nav"),
    peakNavDate: text("peak_nav_date"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("strategy_state_account_instrument_uq").on(table.accountId, table.instrumentId),
  ],
);

export const reviews = sqliteTable(
  "fund_review",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull().references(() => accounts.id),
    instrumentId: text("instrument_id").notNull().references(() => instruments.id),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    investedPrincipal: text("invested_principal").notNull(),
    proceeds: text("proceeds").notNull(),
    realizedProfit: text("realized_profit").notNull(),
    returnRate: text("return_rate").notNull(),
    holdingDays: integer("holding_days").notNull(),
    maxReturnRate: text("max_return_rate"),
    maxDrawdownRate: text("max_drawdown_rate"),
    disciplineScore: integer("discipline_score").notNull(),
    reviewJson: text("review_json").notNull(),
    ...timestamps,
  },
  (table) => [
    index("review_account_idx").on(table.accountId),
    index("review_instrument_idx").on(table.instrumentId),
  ],
);
