CREATE TABLE `fund_intraday_estimate` (
	`id` text PRIMARY KEY NOT NULL,
	`instrument_id` text NOT NULL,
	`estimate_date` text NOT NULL,
	`estimate_time` text NOT NULL,
	`estimated_nav` text NOT NULL,
	`estimated_change_rate` text NOT NULL,
	`holding_coverage_rate` text NOT NULL,
	`basis_nav_date` text NOT NULL,
	`holding_disclosure_date` text,
	`source` text NOT NULL,
	`fetched_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`instrument_id`) REFERENCES `instrument`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `intraday_estimate_instrument_time_uq` ON `fund_intraday_estimate` (`instrument_id`,`estimate_date`,`estimate_time`);--> statement-breakpoint
CREATE INDEX `intraday_estimate_date_idx` ON `fund_intraday_estimate` (`estimate_date`);