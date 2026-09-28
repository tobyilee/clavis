CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_id` text NOT NULL,
	`kind` text NOT NULL,
	`page_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`comment_id` text,
	`from_revision` integer,
	`to_revision` integer,
	`count` integer DEFAULT 1 NOT NULL,
	`first_at` integer NOT NULL,
	`last_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`recipient_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_unread` ON `notifications` (`recipient_id`,`kind`,`page_id`) WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE INDEX `notifications_recent` ON `notifications` (`recipient_id`,`last_at`);--> statement-breakpoint
CREATE TABLE `watches` (
	`actor_id` text NOT NULL,
	`page_id` text NOT NULL,
	`mode` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`actor_id`, `page_id`),
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `watches_page` ON `watches` (`page_id`);--> statement-breakpoint
ALTER TABLE `actors` ADD `mute_agent_edits` integer DEFAULT 0 NOT NULL;