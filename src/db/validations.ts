import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { clientsTable, servicesTable } from "./schema";
import { cpf as cpfValidator, cnpj as cnpjValidator } from "cpf-cnpj-validator";

export const insertClientSchema = createInsertSchema(clientsTable, {
  name: (schema) => schema.pipe(z.string().min(1, "Campo obrigatório")),
  email: () => z.email("E-mail inválido").or(z.literal("")),
  phone: () => z.string().min(10, "Telefone inválido").or(z.literal("")),
  cpf: () =>
    z
      .string()
      .refine((val) => val === "" || cpfValidator.isValid(val), "CPF Inválido")
      .or(z.literal("")),
  cnpj: () =>
    z
      .string()
      .refine(
        (val) => val === "" || cnpjValidator.isValid(val),
        "CNPJ Inválido",
      )
      .or(z.literal("")),
}).omit({ id: true, created_at: true, updated_at: true });

export const selectClientSchema = createSelectSchema(clientsTable);

export type Client = z.infer<typeof selectClientSchema>;
export type NewClient = z.infer<typeof insertClientSchema>;

export const insertServiceSchema = createInsertSchema(servicesTable, {
  client_id: (schema) => schema.pipe(z.string().min(1, "Campo obrigatório")),
  price: (schema) =>
    schema.pipe(z.number().min(0, "Preço deve ser maior ou igual a 0")),
}).omit({ id: true, created_at: true, updated_at: true });

export const selectServiceSchema = createSelectSchema(servicesTable);

export type Service = z.infer<typeof selectServiceSchema>;
export type NewService = z.infer<typeof insertServiceSchema>;
