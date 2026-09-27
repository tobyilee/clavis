CREATE TABLE `page_lint` (
	`page_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`config_version` integer NOT NULL,
	`errors` integer NOT NULL,
	`warnings` integer NOT NULL,
	`infos` integer NOT NULL,
	`rules` text NOT NULL,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `spaces` ADD `lint_config` text;--> statement-breakpoint
ALTER TABLE `spaces` ADD `lint_config_version` integer DEFAULT 0 NOT NULL;