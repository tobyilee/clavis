CREATE TABLE `actors` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`role` text NOT NULL,
	`locale` text DEFAULT 'ko' NOT NULL,
	`created_at` integer NOT NULL,
	`disabled_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actors_email_unique` ON `actors` (`email`);--> statement-breakpoint
CREATE TABLE `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`prefix` text NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_tokens_token_hash_unique` ON `api_tokens` (`token_hash`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`filename` text NOT NULL,
	`r2_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attachments_page_filename` ON `attachments` (`page_id`,`filename`);--> statement-breakpoint
CREATE TABLE `page_links` (
	`from_page_id` text NOT NULL,
	`target_space_key` text NOT NULL,
	`target_title` text NOT NULL,
	`to_page_id` text,
	PRIMARY KEY(`from_page_id`, `target_space_key`, `target_title`),
	FOREIGN KEY (`from_page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `page_links_to` ON `page_links` (`to_page_id`);--> statement-breakpoint
CREATE INDEX `page_links_target` ON `page_links` (`target_space_key`,`target_title`);--> statement-breakpoint
CREATE TABLE `page_tags` (
	`page_id` text NOT NULL,
	`tag` text NOT NULL,
	PRIMARY KEY(`page_id`, `tag`),
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `page_tags_tag` ON `page_tags` (`tag`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`short_id` text NOT NULL,
	`space_id` text NOT NULL,
	`parent_id` text,
	`position` text NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`content` text NOT NULL,
	`doc_type` text NOT NULL,
	`status` text NOT NULL,
	`owner` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`deleted_batch` text,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_short_id_unique` ON `pages` (`short_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pages_title_uniq` ON `pages` (`space_id`,`title`) WHERE "pages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `pages_tree` ON `pages` (`space_id`,`parent_id`,`position`) WHERE "pages"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX `pages_deleted_batch` ON `pages` (`deleted_batch`);--> statement-breakpoint
CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`home_page_id` text,
	`tree_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_key_unique` ON `spaces` (`key`);