CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`service_id` text DEFAULT '' NOT NULL,
	`payment_date` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`payment_type` text DEFAULT 'Pix' NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `service_id_idx` ON `payments` (`service_id`);--> statement-breakpoint
ALTER TABLE `clients` ADD `has_serious_illness` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `services` DROP COLUMN `payment_date`;