import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const clientsTable = sqliteTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  status: text("status", {
    enum: ["Onboarding", "Active", "Inactive"],
  })
    .notNull()
    .default("Onboarding"),
});
