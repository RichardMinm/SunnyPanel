import pg from "pg";

import { migrations } from "@/migrations/index";

const checkpointTables = [
  "checkpoint_blobs",
  "checkpoint_migrations",
  "checkpoint_writes",
  "checkpoints",
] as const;

type MigrationRow = {
  batch: number | string;
  name: string;
};

export type ReleaseReadiness = {
  checkpointsReady: boolean;
  migrationsReady: boolean;
  ready: boolean;
};

export const evaluateReleaseReadiness = ({
  existingCheckpointTables,
  migrationRows,
}: {
  existingCheckpointTables: Iterable<string>;
  migrationRows: MigrationRow[];
}): ReleaseReadiness => {
  const appliedMigrationNames = new Set(
    migrationRows
      .filter((row) => Number(row.batch) !== -1)
      .map((row) => row.name),
  );
  const hasDevMarkers = migrationRows.some((row) => Number(row.batch) === -1);
  const migrationsReady = !hasDevMarkers && migrations.every(
    (migration) => appliedMigrationNames.has(migration.name),
  );
  const availableCheckpointTables = new Set(existingCheckpointTables);
  const checkpointsReady = checkpointTables.every((table) =>
    availableCheckpointTables.has(table)
  );

  return {
    checkpointsReady,
    migrationsReady,
    ready: checkpointsReady && migrationsReady,
  };
};

export const checkReleaseReadiness = async (
  connectionString: string,
): Promise<ReleaseReadiness> => {
  const client = new pg.Client({ connectionString });

  try {
    await client.connect();
    const [{ rows: migrationRows }, { rows: checkpointRows }] = await Promise.all([
      client.query<MigrationRow>(
        "SELECT name, batch FROM payload_migrations ORDER BY id",
      ),
      client.query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = ANY($1::text[])`,
        [[...checkpointTables]],
      ),
    ]);

    return evaluateReleaseReadiness({
      existingCheckpointTables: checkpointRows.map((row) => row.table_name),
      migrationRows,
    });
  } finally {
    await client.end();
  }
};
