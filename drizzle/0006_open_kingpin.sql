CREATE TABLE `ai_assistant_setting` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_name` text NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`api_key` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
