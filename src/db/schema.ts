import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  status: text("status").notNull().default("Onboarding"),
});

// Zod Schemas for Validation
// We refine the schema to ensure the name is not empty
export const insertClientSchema = createInsertSchema(clients, {
  name: (schema) => schema.pipe(z.string().min(1, "Name is required")),
});

export const selectClientSchema = createSelectSchema(clients);

export type Client = z.infer<typeof selectClientSchema>;
export type NewClient = z.infer<typeof insertClientSchema>;
