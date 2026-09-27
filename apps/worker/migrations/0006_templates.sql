CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`doc_type` text NOT NULL,
	`content` text NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `templates_space` ON `templates` (`space_id`);