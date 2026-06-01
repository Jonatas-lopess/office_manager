CREATE TABLE `service_tags` (
	`service_id` text NOT NULL,
	`tag_id` text NOT NULL,
	PRIMARY KEY(`service_id`, `tag_id`)
);
--> statement-breakpoint
CREATE INDEX `service_tags_service_idx` ON `service_tags` (`service_id`);--> statement-breakpoint
CREATE INDEX `service_tags_tag_idx` ON `service_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#6366f1' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
