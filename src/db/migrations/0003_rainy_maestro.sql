ALTER TABLE `clients` RENAME COLUMN "nire" TO "nirf";--> statement-breakpoint
DROP INDEX `clients_nire_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `clients_nirf_unique` ON `clients` (`nirf`);