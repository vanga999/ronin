CREATE TABLE `fund_review` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`invested_principal` text NOT NULL,
	`proceeds` text NOT NULL,
	`realized_profit` text NOT NULL,
	`return_rate` text NOT NULL,
	`holding_days` integer NOT NULL,
	`max_return_rate` text,
	`max_drawdown_rate` text,
	`discipline_score` integer NOT NULL,
	`review_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `fund_account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instrument`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_account_idx` ON `fund_review` (`account_id`);--> statement-breakpoint
CREATE INDEX `review_instrument_idx` ON `fund_review` (`instrument_id`);--> statement-breakpoint
CREATE TABLE `fund_strategy_state` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`instrument_id` text NOT NULL,
	`stage` text DEFAULT 'NORMAL' NOT NULL,
	`first_triggered_at` text,
	`first_executed_at` text,
	`peak_nav` text,
	`peak_nav_date` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `fund_account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instrument`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `strategy_state_account_instrument_uq` ON `fund_strategy_state` (`account_id`,`instrument_id`);--> statement-breakpoint
ALTER TABLE `position_lot` ADD `remaining_principal` text DEFAULT '0' NOT NULL;--> statement-breakpoint
UPDATE `position_lot`
SET `remaining_principal` = `purchase_amount`
WHERE CAST(`remaining_principal` AS REAL) = 0
  AND `status` = 'OPEN';--> statement-breakpoint
ALTER TABLE `fund_signal` ADD `resolution_note` text;--> statement-breakpoint
ALTER TABLE `fund_signal` ADD `resolved_at` text;
