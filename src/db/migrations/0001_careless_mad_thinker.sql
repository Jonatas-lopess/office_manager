CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`type` text DEFAULT 'Outros',
	`client_id` text DEFAULT '' NOT NULL,
	`client_name` text DEFAULT '' NOT NULL,
	`description` text,
	`contract_date` text DEFAULT '' NOT NULL,
	`final_date` text,
	`price` real DEFAULT 0 NOT NULL,
	`payment_date` text,
	`payment_method` text,
	`installments` integer,
	`observations` text,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE `clients` ADD `cpf` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `birth_date` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `email` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `payment_source` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `gov_password` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `cnpj` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `cnpj_begin_date` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `mei_type` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `nire` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `cib` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `incra` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `estadual_inscription` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `observations` text;--> statement-breakpoint
ALTER TABLE `clients` ADD `created_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `clients` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `clients_cpf_unique` ON `clients` (`cpf`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_cnpj_unique` ON `clients` (`cnpj`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_nire_unique` ON `clients` (`nire`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_cib_unique` ON `clients` (`cib`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_incra_unique` ON `clients` (`incra`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_estadual_inscription_unique` ON `clients` (`estadual_inscription`);