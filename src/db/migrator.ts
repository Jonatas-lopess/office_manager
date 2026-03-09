import { DB } from "@vlcn.io/crsqlite-wasm";

const migrationFiles = import.meta.glob("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export async function runMigrations(db: DB) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedRows = await db.execA(
    "SELECT filename FROM __drizzle_migrations",
  );
  const appliedMigrations = new Set(appliedRows.map((row) => row[0]));
  const fileNames = Object.keys(migrationFiles).sort();

  for (const fileName of fileNames) {
    if (appliedMigrations.has(fileName)) {
      continue;
    }

    const sql = migrationFiles[fileName];

    try {
      await db.exec("BEGIN TRANSACTION;");

      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const stmt of statements) {
        await db.exec(stmt);
      }

      await db.exec("INSERT INTO __drizzle_migrations (filename) VALUES (?)", [
        fileName,
      ]);

      await db.exec("COMMIT;");

      const createTableMatches = sql.matchAll(/CREATE TABLE `([^`]+)`/g);
      for (const match of createTableMatches) {
        const tableName = match[1];
        if (!tableName.startsWith("__")) {
          await db.exec(`SELECT crsql_as_crr('${tableName}');`);
        }
      }
    } catch (err) {
      await db.exec("ROLLBACK;");
      throw err;
    }
  }
}
