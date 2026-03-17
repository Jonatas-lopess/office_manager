import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const clientsTable = sqliteTable("clients", {
  id: text("id").primaryKey(),
  status: text("status", {
    enum: ["Onboarding", "Active", "Inactive"],
  })
    .notNull()
    .default("Onboarding"),
  name: text("name").notNull().default(""),
  cpf: text("cpf"),
  birth_date: integer("birth_date", { mode: "timestamp_ms" }),
  phone: text("phone"),
  email: text("email"),
  payment_source: text("payment_source"),
  gov_password: text("gov_password"),
  cnpj: text("cnpj"),
  cnpj_begin_date: integer("cnpj_begin_date", { mode: "timestamp_ms" }),
  mei_type: text("mei_type", {
    enum: ["Comercy", "Service", "Production", "Specific"],
  }),
  nirf: text("nirf"),
  cib: text("cib"),
  incra: text("incra"),
  estadual_inscription: text("estadual_inscription"),
  observations: text("observations"),
  created_at: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
  updated_at: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
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

export const servicesTable = sqliteTable(
  "services",
  {
    id: text("id").primaryKey(),
    status: text("status", {
      enum: ["Draft", "In progress", "Delivered", "Invoiced"],
    })
      .notNull()
      .default("Draft"),
    type: text("type", { enum: serviceTypesArray }).default("Outros"),
    client_id: text("client_id").notNull().default(""),
    description: text("description"),
    contract_date: integer("contract_date", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    final_date: integer("final_date", { mode: "timestamp_ms" }),
    price: real("price").notNull().default(0),
    payment_date: integer("payment_date", { mode: "timestamp_ms" }),
    payment_method: text("payment_method"),
    installments: integer("installments"),
    observations: text("observations"),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [index("client_id_idx").on(table.client_id)],
);

export const logsTable = sqliteTable("logs", {
  id: text("id").primaryKey(),
  action: text("action").notNull().default(""),
  module: text("module").notNull().default(""),
  device: text("device"),
  status: text("status", {
    enum: ["Success", "Error", "Warning"],
  })
    .notNull()
    .default("Success"),
  created_at: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
});
