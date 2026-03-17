PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_services` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`type` text DEFAULT 'Outros',
	`client_id` text DEFAULT '' NOT NULL,
	`description` text,
	`contract_date` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`final_date` integer,
	`price` real DEFAULT 0 NOT NULL,
	`payment_date` integer,
	`payment_method` text,
	`installments` integer,
	`observations` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_services`("id", "status", "type", "client_id", "description", "contract_date", "final_date", "price", "payment_date", "payment_method", "installments", "observations", "created_at", "updated_at") SELECT "id", "status", "type", "client_id", "description", "contract_date", "final_date", "price", "payment_date", "payment_method", "installments", "observations", "created_at", "updated_at" FROM `services`;--> statement-breakpoint
DROP TABLE `services`;--> statement-breakpoint
ALTER TABLE `__new_services` RENAME TO `services`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `client_id_idx` ON `services` (`client_id`);--> statement-breakpoint
CREATE TABLE `__new_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'Onboarding' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`cpf` text,
	`birth_date` integer,
	`phone` text,
	`email` text,
	`payment_source` text,
	`gov_password` text,
	`cnpj` text,
	`cnpj_begin_date` integer,
	`mei_type` text,
	`nirf` text,
	`cib` text,
	`incra` text,
	`estadual_inscription` text,
	`observations` text,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL,
	`updated_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_clients`("id", "status", "name", "cpf", "birth_date", "phone", "email", "payment_source", "gov_password", "cnpj", "cnpj_begin_date", "mei_type", "nirf", "cib", "incra", "estadual_inscription", "observations", "created_at", "updated_at") SELECT "id", "status", "name", "cpf", "birth_date", "phone", "email", "payment_source", "gov_password", "cnpj", "cnpj_begin_date", "mei_type", "nirf", "cib", "incra", "estadual_inscription", "observations", "created_at", "updated_at" FROM `clients`;--> statement-breakpoint
DROP TABLE `clients`;--> statement-breakpoint
ALTER TABLE `__new_clients` RENAME TO `clients`;--> statement-breakpoint
CREATE TABLE `__new_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text DEFAULT '' NOT NULL,
	`module` text DEFAULT '' NOT NULL,
	`device` text,
	`status` text DEFAULT 'Success' NOT NULL,
	`created_at` integer DEFAULT (strftime('%s', 'now') * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_logs`("id", "action", "module", "device", "status", "created_at") SELECT "id", "action", "module", "device", "status", "created_at" FROM `logs`;--> statement-breakpoint
DROP TABLE `logs`;--> statement-breakpoint
ALTER TABLE `__new_logs` RENAME TO `logs`;
