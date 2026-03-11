import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { clientsTable, servicesTable, serviceTypesArray } from "./schema";

export const insertClientSchema = createInsertSchema(clientsTable, {
  name: (schema) => schema.pipe(z.string().min(1, "Name is required")),
  status: (schema) => schema.pipe(z.enum(["Onboarding", "Active", "Inactive"])),
  mei_type: (schema) =>
    schema.pipe(z.enum(["Comercy", "Service", "Production", "Specific"])),
});

export const selectClientSchema = createSelectSchema(clientsTable);

export type Client = z.infer<typeof selectClientSchema>;
export type NewClient = z.infer<typeof insertClientSchema>;

export const insertServiceSchema = createInsertSchema(servicesTable, {
  type: (schema) => schema.pipe(z.enum(serviceTypesArray)),
  status: (schema) =>
    schema.pipe(z.enum(["Draft", "In progress", "Delivered", "Invoiced"])),
  client_id: (schema) =>
    schema.pipe(z.string().min(1, "Client ID is required")),
  client_name: (schema) =>
    schema.pipe(z.string().min(1, "Client name is required")),
  price: (schema) =>
    schema.pipe(z.number().min(0, "Price must be greater than or equal to 0")),
});

export const selectServiceSchema = createSelectSchema(servicesTable);

export type Service = z.infer<typeof selectServiceSchema>;
export type NewService = z.infer<typeof insertServiceSchema>;
