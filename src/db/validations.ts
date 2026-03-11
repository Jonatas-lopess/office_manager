import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { clientsTable, servicesTable } from "./schema";

export const insertClientSchema = createInsertSchema(clientsTable, {
  name: (schema) => schema.pipe(z.string().min(1, "Name is required")),
  email: () => z.string().email("E-mail inválido").or(z.literal("")),
  phone: () => z.string().min(10, "Telefone inválido").or(z.literal("")),
  cpf: () => z.string().length(14, "CPF deve ter 14 caracteres (000.000.000-00)").or(z.literal("")),
  cnpj: () => z.string().length(18, "CNPJ deve ter 18 caracteres (00.000.000/0000-00)").or(z.literal("")),
});

export const selectClientSchema = createSelectSchema(clientsTable);

export type Client = z.infer<typeof selectClientSchema>;
export type NewClient = z.infer<typeof insertClientSchema>;

export const insertServiceSchema = createInsertSchema(servicesTable, {
  client_id: (schema) =>
    schema.pipe(z.string().min(1, "Client ID is required")),
  price: (schema) =>
    schema.pipe(z.number().min(0, "Price must be greater than or equal to 0")),
});

export const selectServiceSchema = createSelectSchema(servicesTable);

export type Service = z.infer<typeof selectServiceSchema>;
export type NewService = z.infer<typeof insertServiceSchema>;
