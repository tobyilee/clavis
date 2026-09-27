CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`section_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer,
	`resolved_at` integer,
	`resolved_by` text,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resolved_by`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `comments_page` ON `comments` (`page_id`,`thread_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_open` ON `comments` (`page_id`) WHERE "comments"."id" = "comments"."thread_id" AND "comments"."resolved_at" IS NULL;