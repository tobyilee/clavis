CREATE TABLE `favorites` (
	`actor_id` text NOT NULL,
	`page_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`actor_id`, `page_id`),
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `page_views` (
	`actor_id` text NOT NULL,
	`page_id` text NOT NULL,
	`viewed_at` integer NOT NULL,
	PRIMARY KEY(`actor_id`, `page_id`),
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `page_views_recent` ON `page_views` (`actor_id`,`viewed_at`);--> statement-breakpoint
CREATE INDEX `pages_updated` ON `pages` (`updated_at`) WHERE "pages"."deleted_at" IS NULL;