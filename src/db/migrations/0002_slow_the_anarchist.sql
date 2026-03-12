PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_services` (
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
INSERT INTO `__new_services`("id", "status", "type", "client_id", "description", "contract_date", "final_date", "price", "payment_date", "payment_method", "installments", "observations", "created_at", "updated_at") SELECT "id", "status", "type", "client_id", "description", "contract_date", "final_date", "price", "payment_date", "payment_method", "installments", "observations", "created_at", "updated_at" FROM `services`;--> statement-breakpoint
DROP TABLE `services`;--> statement-breakpoint
ALTER TABLE `__new_services` RENAME TO `services`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `client_id_idx` ON `services` (`client_id`);