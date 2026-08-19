import { v7 as uuidv7 } from "uuid";
import { lt } from "drizzle-orm";
import { logsTable } from "@/db/schema";

export const LOG_RETENTION_KEY = "log_retention_days";
export const DEFAULT_LOG_RETENTION_DAYS = 90;

export const getLogRetentionDays = (): number => {
  const stored = localStorage.getItem(LOG_RETENTION_KEY);
  if (stored === null) return DEFAULT_LOG_RETENTION_DAYS;
  const days = Number(stored);
  return Number.isFinite(days) ? days : DEFAULT_LOG_RETENTION_DAYS;
};

export const setLogRetentionDays = (days: number) => {
  localStorage.setItem(LOG_RETENTION_KEY, String(days));
};

// days <= 0 means "keep forever" — no-op.
export const pruneOldLogs = async (
  orm: { delete: (table: typeof logsTable) => any },
  days: number,
) => {
  if (!days || days <= 0) return;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    await orm.delete(logsTable).where(lt(logsTable.created_at, cutoff));
  } catch (err) {
    console.error("[Logger] Failed to prune old logs:", err);
  }
};

export const logAction = async (
  orm: { insert: (table: typeof logsTable) => any },
  data: {
    action: string;
    module: string;
    status?: "Success" | "Error" | "Warning";
    device?: string;
    entityType?: "client" | "service";
    entityId?: string;
  },
) => {
  try {
    await orm.insert(logsTable).values({
      id: uuidv7(),
      action: data.action,
      module: data.module,
      status: data.status || "Success",
      device: data.device || "Unknown",
      entity_type: data.entityType,
      entity_id: data.entityId,
      created_at: new Date(),
    });
  } catch (err) {
    console.error("[Logger] Failed to write log:", err);
  }
};
