CREATE TABLE `fund_signal` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`instrument_id` text,
	`target_key` text NOT NULL,
	`signal_date` text NOT NULL,
	`signal_type` text NOT NULL,
	`trigger_reason` text NOT NULL,
	`trigger_metrics_json` text NOT NULL,
	`strategy_snapshot_json` text NOT NULL,
	`suggested_action` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `fund_account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instrument`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fund_signal_target_date_uq` ON `fund_signal` (`account_id`,`target_key`,`signal_date`);--> statement-breakpoint
CREATE INDEX `fund_signal_date_idx` ON `fund_signal` (`signal_date`);--> statement-breakpoint
CREATE INDEX `fund_signal_instrument_idx` ON `fund_signal` (`instrument_id`);--> statement-breakpoint
ALTER TABLE `fund_strategy` ADD `max_total_cost` text DEFAULT '50000' NOT NULL;