CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'Onboarding' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`cpf` text,
	`birth_date` text,
	`phone` text,
	`email` text,
	`payment_source` text,
	`gov_password` text,
	`cnpj` text,
	`cnpj_begin_date` text,
	`mei_type` text,
	`nirf` text,
	`cib` text,
	`incra` text,
	`estadual_inscription` text,
	`observations` text,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_cpf_unique` ON `clients` (`cpf`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_cnpj_unique` ON `clients` (`cnpj`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_nirf_unique` ON `clients` (`nirf`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_cib_unique` ON `clients` (`cib`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_incra_unique` ON `clients` (`incra`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_estadual_inscription_unique` ON `clients` (`estadual_inscription`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`type` text DEFAULT 'Outros',
	`client_id` text NOT NULL,
	`description` text,
	`contract_date` text DEFAULT '' NOT NULL,
	`final_date` text,
	`price` real DEFAULT 0 NOT NULL,
	`payment_date` text,
	`payment_method` text,
	`installments` integer,
	`observations` text,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `client_id_idx` ON `services` (`client_id`);