CREATE TABLE `fund_account` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`initial_capital` text NOT NULL,
	`target_profit` text NOT NULL,
	`strategy_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`strategy_id`) REFERENCES `fund_strategy`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `instrument` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`instrument_type` text DEFAULT 'MUTUAL_FUND' NOT NULL,
	`fund_company` text,
	`fund_type` text,
	`share_class` text,
	`investment_theme` text,
	`risk_level` text,
	`data_source` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instrument_code_type_uq` ON `instrument` (`code`,`instrument_type`);--> statement-breakpoint
CREATE TABLE `operation_log` (
	`id` text PRIMARY KEY NOT NULL,
	`operation_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`request_id` text NOT NULL,
	`detail_json` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operation_log_entity_idx` ON `operation_log` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `operation_log_request_idx` ON `operation_log` (`request_id`);--> statement-breakpoint
CREATE TABLE `position_lot` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	`purchase_date` text NOT NULL,
	`purchase_amount` text NOT NULL,
	`confirmed_nav` text NOT NULL,
	`confirmed_shares` text NOT NULL,
	`remaining_shares` text NOT NULL,
	`purchase_fee` text DEFAULT '0' NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `fund_account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instrument`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `position_lot_account_idx` ON `position_lot` (`account_id`);--> statement-breakpoint
CREATE INDEX `position_lot_instrument_idx` ON `position_lot` (`instrument_id`);--> statement-breakpoint
CREATE TABLE `fund_strategy` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`first_take_profit_rate` text NOT NULL,
	`first_take_profit_ratio` text NOT NULL,
	`second_take_profit_rate` text NOT NULL,
	`drawdown_take_profit_rate` text NOT NULL,
	`warning_loss_rate` text NOT NULL,
	`exit_review_loss_rate` text NOT NULL,
	`locked` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fund_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	`lot_id` text,
	`transaction_type` text NOT NULL,
	`transaction_date` text NOT NULL,
	`amount` text,
	`nav` text,
	`shares` text,
	`fee` text DEFAULT '0' NOT NULL,
	`proceeds` text,
	`realized_profit` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `fund_account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instrument`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lot_id`) REFERENCES `position_lot`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `transaction_account_idx` ON `fund_transaction` (`account_id`);--> statement-breakpoint
CREATE INDEX `transaction_instrument_idx` ON `fund_transaction` (`instrument_id`);