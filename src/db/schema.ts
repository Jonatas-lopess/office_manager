import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const clientsTable = sqliteTable("clients", {
  id: text("id").primaryKey(),
  status: text("status", {
    enum: ["Onboarding", "Active", "Inactive"],
  })
    .notNull()
    .default("Onboarding"),
  name: text("name").notNull().default(""),
  cpf: text("cpf").unique(),
  birth_date: text("birth_date"),
  phone: text("phone"),
  email: text("email"),
  payment_source: text("payment_source"),
  gov_password: text("gov_password"),
  cnpj: text("cnpj").unique(),
  cnpj_begin_date: text("cnpj_begin_date"),
  mei_type: text("mei_type", {
    enum: ["Comercy", "Service", "Production", "Specific"],
  }),
  nire: text("nire").unique(),
  cib: text("cib").unique(),
  incra: text("incra").unique(),
  estadual_inscription: text("estadual_inscription").unique(),
  observations: text("observations"),
  created_at: text("created_at").notNull().default(""),
  updated_at: text("updated_at").notNull().default(""),
});

export const serviceTypesArray = [
  "Declaração de Imposto de Renda Pessoa Física",
  "Declaração Anual de MEI",
  "Abertura de MEI",
  "Encerramento de MEI",
  "Declaração Encerramento MEI",
  "Parcelamento Dívida Ativa",
  "Parcelamento DAS Atrasado",
  "Parcelamento IR Atrasado",
  "Declaração ITR",
  "Emissão Nota Fiscal",
  "Planilha de Processo RFB",
  "Abertura de Processo INSS",
  "Declaração Retificadora IR",
  "Alteração de CNPJ",
  "Consulta Fical",
  "SISPATRI",
  "Outros",
] as const;

export const servicesTable = sqliteTable("services", {
  id: text("id").primaryKey(),
  status: text("status", {
    enum: ["Draft", "In progress", "Delivered", "Invoiced"],
  })
    .notNull()
    .default("Draft"),
  type: text("type", { enum: serviceTypesArray }).default("Outros"),
  client_id: text("client_id").notNull().default(""),
  client_name: text("client_name").notNull().default(""),
  description: text("description"),
  contract_date: text("contract_date").notNull().default(""),
  final_date: text("final_date"),
  price: real("price").notNull().default(0),
  payment_date: text("payment_date"),
  payment_method: text("payment_method"),
  installments: integer("installments"),
  observations: text("observations"),
  created_at: text("created_at").notNull().default(""),
  updated_at: text("updated_at").notNull().default(""),
});
