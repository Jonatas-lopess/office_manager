CREATE TABLE `logs` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`module` text NOT NULL,
	`device` text,
	`status` text DEFAULT 'Success' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL
);
