CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`webhook_id` text NOT NULL,
	`event_key` text NOT NULL,
	`event` text NOT NULL,
	`page_id` text,
	`actor_id` text,
	`attempt` integer NOT NULL,
	`status` integer,
	`ok` integer NOT NULL,
	`error` text,
	`at` integer NOT NULL,
	FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `webhook_deliveries_recent` ON `webhook_deliveries` (`webhook_id`,`at`);--> statement-breakpoint
CREATE INDEX `webhook_deliveries_event` ON `webhook_deliveries` (`webhook_id`,`event_key`);--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`secret` text NOT NULL,
	`events` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `webhooks_space` ON `webhooks` (`space_id`);