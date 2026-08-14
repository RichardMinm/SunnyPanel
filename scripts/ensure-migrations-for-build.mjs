/**
 * Verify Payload migration state before production startup.
 *
 * - Rejects leftover dev-mode markers (batch = -1) without modifying them.
 * - Verifies every registered migration has a payload_migrations record.
 * - Never changes schema or migration records.
 */
import "dotenv/config";
import pg from "pg";

import { migrations } from "../src/migrations/index.ts";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[ensure-migrations] DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();

  const { rows: existingRows } = await client.query(
    "SELECT name, batch FROM payload_migrations ORDER BY id",
  );
  const devRows = existingRows.filter((row) => Number(row.batch) === -1);

  if (devRows.length > 0) {
    console.error(
      `[ensure-migrations] Found ${devRows.length} dev-mode migration marker(s): ${devRows.map((row) => row.name).join(", ")}`,
    );
    console.error(
      "[ensure-migrations] Refusing to hide schema drift. Reconcile the database before release.",
    );
    process.exit(1);
  }

  const existingNames = new Set(existingRows.map((row) => row.name));
  const missingMigrations = migrations
    .map((migration) => migration.name)
    .filter((name) => !existingNames.has(name));

  if (missingMigrations.length > 0) {
    console.error(
      `[ensure-migrations] Pending migrations: ${missingMigrations.join(", ")}`,
    );
    console.error('[ensure-migrations] Run "npm run migrate" before building.');
    process.exit(1);
  }

  console.log("[ensure-migrations] Migration state is ready for production startup.");
} catch (error) {
  console.error(
    "[ensure-migrations] Failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
} finally {
  await client.end();
}
