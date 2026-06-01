import {
  index,
  integer,
  primaryKey,
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
    enum: ["Commerce", "Service", "Production", "Specific"],
  }),
  nirf: text("nirf"),
  cib: text("cib"),
  incra: text("incra"),
  estadual_inscription: text("estadual_inscription"),
  observations: text("observations"),
  has_serious_illness: integer("has_serious_illness", { mode: "boolean" })
    .notNull()
    .default(false),
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
  "Declaração de Encerramento do MEI",
  "Parcelamento Dívida Ativa",
  "Parcelamento DAS Atrasado",
  "Parcelamento IR Atrasado",
  "Declaração ITR",
  "Emissão Nota Fiscal",
  "Planilha de Processo RFB",
  "Abertura de Processo INSS",
  "Declaração Retificadora IR",
  "Alteração de CNPJ",
  "Consulta Fiscal",
  "SISPATRI",
  "Outros",
] as const;

export const servicesTable = sqliteTable(
  "services",
  {
    id: text("id").primaryKey(),
    status: text("status", {
      enum: ["Draft", "In progress", "Delivered"],
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
    restitution_date: integer("restitution_date", { mode: "timestamp_ms" }),
    price: real("price").notNull().default(0),
    payment_method: text("payment_method", {
      enum: ["In_Cash", "Installments"],
    }),
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

export const paymentsTable = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    service_id: text("service_id").notNull().default(""),
    payment_date: integer("payment_date", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    payment_type: text("payment_type", {
      enum: ["Pix", "Credit Card", "Debit Card", "Cash", "Bank Transfer"],
    })
      .notNull()
      .default("Pix"),
    amount: real("amount").notNull().default(0),
    created_at: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
    updated_at: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s', 'now') * 1000)`),
  },
  (table) => [index("service_id_idx").on(table.service_id)],
);

export const tagsTable = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  color: text("color").notNull().default("#6366f1"),
  created_at: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(strftime('%s', 'now') * 1000)`),
});

export const serviceTagsTable = sqliteTable(
  "service_tags",
  {
    service_id: text("service_id").notNull(),
    tag_id: text("tag_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.service_id, table.tag_id] }),
    index("service_tags_service_idx").on(table.service_id),
    index("service_tags_tag_idx").on(table.tag_id),
  ],
);
