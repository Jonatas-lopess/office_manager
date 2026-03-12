import { v7 as uuidv7 } from "uuid";
import { logsTable } from "@/db/schema";

export const logAction = async (
  orm: { insert: (table: typeof logsTable) => any },
  data: {
    action: string;
    module: string;
    status?: "Success" | "Error" | "Warning";
    device?: string;
  },
) => {
  try {
    await orm.insert(logsTable).values({
      id: uuidv7(),
      action: data.action,
      module: data.module,
      status: data.status || "Success",
      device: data.device || "Unknown",
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Logger] Failed to write log:", err);
  }
};
