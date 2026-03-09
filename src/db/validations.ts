import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { clientsTable } from "./schema";

export const insertClientSchema = createInsertSchema(clientsTable, {
  name: (schema) => schema.pipe(z.string().min(1, "Name is required")),
  status: (schema) => schema.pipe(z.enum(["Onboarding", "Active", "Inactive"])),
});

export const selectClientSchema = createSelectSchema(clientsTable);

export type Client = z.infer<typeof selectClientSchema>;
export type NewClient = z.infer<typeof insertClientSchema>;
