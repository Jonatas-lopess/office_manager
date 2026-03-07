CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Onboarding' NOT NULL
);
