CREATE TABLE `page_revisions` (
	`page_id` text NOT NULL,
	`revision` integer NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`title` text NOT NULL,
	`bytes` integer NOT NULL,
	`kind` text NOT NULL,
	`restored_from` integer,
	PRIMARY KEY(`page_id`, `revision`),
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
