CREATE TABLE `page_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`ord` integer NOT NULL,
	`section_id` text,
	`heading` text,
	`excerpt` text NOT NULL,
	`chars` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `page_chunks_page` ON `page_chunks` (`page_id`);--> statement-breakpoint
CREATE TABLE `page_index` (
	`page_id` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`indexed_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action
);
