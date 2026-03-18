import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { clientsTable, logsTable, servicesTable, paymentsTable } from "./schema";
import { cpf as cpfValidator, cnpj as cnpjValidator } from "cpf-cnpj-validator";
import { NIRFvalidator } from "@/lib/utils";

export const insertClientSchema = createInsertSchema(clientsTable, {
  name: (schema) => schema.pipe(z.string().min(1, "Campo obrigatório")),
  email: () => z.email("E-mail inválido").or(z.literal("")).optional().nullable(),
  phone: () =>
    z.string().min(10, "Telefone inválido").or(z.literal("")).optional().nullable(),
  cpf: () =>
    z
      .string()
      .refine((val) => val === "" || cpfValidator.isValid(val), "CPF Inválido")
      .or(z.literal(""))
      .optional()
      .nullable(),
  cnpj: () =>
    z
      .string()
      .refine(
        (val) => val === "" || cnpjValidator.isValid(val),
        "CNPJ Inválido",
      )
      .or(z.literal(""))
      .optional()
      .nullable(),
  nirf: () =>
    z
      .string()
      .refine((val) => val === "" || NIRFvalidator(val), "NIRF inválido")
      .or(z.literal(""))
      .optional()
      .nullable(),
  has_serious_illness: (schema) => schema.pipe(z.boolean()).optional(),
})
  .extend({
    birth_date: z.date().nullable().optional(),
    cnpj_begin_date: z.date().nullable().optional(),
  })
  .omit({ id: true, created_at: true, updated_at: true });

export const selectClientSchema = createSelectSchema(clientsTable);

export type Client = z.infer<typeof selectClientSchema>;
export type NewClient = z.infer<typeof insertClientSchema>;

export const insertServiceSchema = createInsertSchema(servicesTable, {
  client_id: (schema) => schema.pipe(z.string().min(1, "Campo obrigatório")),
  price: (schema) =>
    schema.pipe(z.number().min(0, "Preço deve ser maior ou igual a 0")),
})
  .extend({
    contract_date: z.date().optional(),
    final_date: z.date().nullable().optional(),
  })
  .omit({ id: true, created_at: true, updated_at: true });

export const selectServiceSchema = createSelectSchema(servicesTable);

export type Service = z.infer<typeof selectServiceSchema>;
export type NewService = z.infer<typeof insertServiceSchema>;

export const insertLogSchema = createInsertSchema(logsTable, {
  action: (schema) => schema.pipe(z.string().min(1, "Campo obrigatório")),
  module: (schema) => schema.pipe(z.string().min(1, "Campo obrigatório")),
  status: (schema) => schema.pipe(z.enum(["Success", "Error", "Warning"])),
}).omit({ id: true, created_at: true });

export const selectLogSchema = createSelectSchema(logsTable);

export type Log = z.infer<typeof selectLogSchema>;
export type NewLog = z.infer<typeof insertLogSchema>;

export const insertPaymentSchema = createInsertSchema(paymentsTable, {
  service_id: (schema) => schema.pipe(z.string().min(1, "Campo obrigatório")),
  amount: (schema) =>
    schema.pipe(z.number().min(0, "Valor deve ser maior ou igual a 0")),
}).omit({ id: true, created_at: true, updated_at: true });

export const selectPaymentSchema = createSelectSchema(paymentsTable);

export type Payment = z.infer<typeof selectPaymentSchema>;
export type NewPayment = z.infer<typeof insertPaymentSchema>;
