import { DB } from "@vlcn.io/crsqlite-wasm";

// In Vite, this imports all .sql files in the migrations folder as raw strings.
const migrationFiles = import.meta.glob("./migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export async function runMigrations(db: DB) {
  // Create a table to track migrations if it doesn't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Get applied migrations
  const appliedRows = await db.execA(
    "SELECT filename FROM __drizzle_migrations",
  );
  const appliedMigrations = new Set(appliedRows.map((row) => row[0]));

  // Sort files by name so they run in order
  const fileNames = Object.keys(migrationFiles).sort();

  for (const fileName of fileNames) {
    if (appliedMigrations.has(fileName)) {
      continue;
    }

    const sql = migrationFiles[fileName];

    // Execute the migration inside a transaction
    try {
      await db.exec("BEGIN TRANSACTION;");

      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      // Need to run each statement properly
      for (const stmt of statements) {
        await db.exec(stmt);
      }

      await db.exec("INSERT INTO __drizzle_migrations (filename) VALUES (?)", [
        fileName,
      ]);

      await db.exec("COMMIT;");
      console.log(`Applied migration: ${fileName}`);

      // CR-SQLite specific: Run crsql_as_crr OUTSIDE the transaction.
      // Modifying PRAGMAs and creating tracking tables/triggers often conflicts with active transactions.
      const createTableMatches = sql.matchAll(/CREATE TABLE `([^`]+)`/g);
      for (const match of createTableMatches) {
        const tableName = match[1];
        if (!tableName.startsWith("__")) {
          await db.exec(`SELECT crsql_as_crr('${tableName}');`);
          console.log(`Converted ${tableName} to CRR.`);
        }
      }
    } catch (err) {
      try {
        await db.exec("ROLLBACK;");
      } catch (rollbackErr) {
        console.error(
          "Rollback failed (transaction may not have been active):",
          rollbackErr,
        );
      }
      console.error(`Failed to apply migration: ${fileName}.`, err);
      throw err;
    }
  }
}
