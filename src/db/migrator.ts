import { DB } from "@vlcn.io/crsqlite-wasm";

const migrationFiles = import.meta.glob("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export async function runMigrations(db: DB) {
  // Initialize internal migrations table
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
      // 1. Get existing CRR tables to prepare for alteration
      const crrsResult = await db.execA(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%' AND name NOT LIKE '%crsql_%';",
      );

      const tablesToAlter: string[] = [];
      for (const [tableName] of crrsResult) {
        const isCrr = await db.execA(
          `SELECT count(*) FROM sqlite_master WHERE type='table' AND name='${tableName}__crsql_clock'`,
        );
        if ((isCrr[0][0] as number) > 0) {
          tablesToAlter.push(tableName as string);
        }
      }

      // 2. Begin Alter Cycle
      for (const table of tablesToAlter) {
        await db.exec(`SELECT crsql_begin_alter('${table}');`);
      }

      // 3. Execute Migration Statements
      const statements = sql
        .split(/;|\n?--> statement-breakpoint\n?/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--"));

      for (const stmt of statements) {
        await db.exec(stmt);
      }

      await db.exec("INSERT INTO __drizzle_migrations (filename) VALUES (?)", [
        fileName,
      ]);

      // 4. Commit Alterations & Ensure CRR status
      const currentTablesResult = await db.execA(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle_%' AND name NOT LIKE '%crsql_%';",
      );
      const currentTables = new Set(
        currentTablesResult.map((row) => row[0] as string),
      );

      for (const table of tablesToAlter) {
        if (currentTables.has(table)) {
          await db.exec(`SELECT crsql_commit_alter('${table}');`);
        }
      }

      for (const table of currentTables) {
        await db.exec(`SELECT crsql_as_crr('${table}');`);
      }
    } catch (err) {
      console.error(`❌ [Migrator] Error in ${fileName}:`, err);
      throw err;
    }
  }

  console.log(`✨ [Migrator] Migrations complete`);
}
