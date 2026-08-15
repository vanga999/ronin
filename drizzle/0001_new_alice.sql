CREATE TABLE `fund_daily_snapshot` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`snapshot_date` text NOT NULL,
	`invested_principal` text NOT NULL,
	`market_value` text NOT NULL,
	`profit_amount` text NOT NULL,
	`return_rate` text NOT NULL,
	`daily_profit` text NOT NULL,
	`stale_fund_count` integer DEFAULT 0 NOT NULL,
	`report_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `fund_account`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_snapshot_account_date_uq` ON `fund_daily_snapshot` (`account_id`,`snapshot_date`);--> statement-breakpoint
CREATE INDEX `daily_snapshot_date_idx` ON `fund_daily_snapshot` (`snapshot_date`);--> statement-breakpoint
CREATE TABLE `fund_nav` (
	`id` text PRIMARY KEY NOT NULL,
	`instrument_id` text NOT NULL,
	`nav_date` text NOT NULL,
	`unit_nav` text NOT NULL,
	`accumulated_nav` text,
	`daily_change_rate` text,
	`source` text NOT NULL,
	`data_status` text DEFAULT 'OFFICIAL' NOT NULL,
	`fetched_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instrument`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fund_nav_instrument_date_uq` ON `fund_nav` (`instrument_id`,`nav_date`);--> statement-breakpoint
CREATE INDEX `fund_nav_date_idx` ON `fund_nav` (`nav_date`);