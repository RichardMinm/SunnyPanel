import assert from "node:assert/strict";
import { test } from "node:test";

import { migrations } from "../../src/migrations/index";
import { evaluateReleaseReadiness } from "../../src/lib/release/readiness";

const checkpointTables = [
  "checkpoint_blobs",
  "checkpoint_migrations",
  "checkpoint_writes",
  "checkpoints",
];

const appliedMigrations = migrations.map((migration, index) => ({
  batch: index + 1,
  name: migration.name,
}));

test("release readiness requires every migration and checkpoint table", () => {
  assert.deepEqual(
    evaluateReleaseReadiness({
      existingCheckpointTables: checkpointTables,
      migrationRows: appliedMigrations,
    }),
    {
      checkpointsReady: true,
      migrationsReady: true,
      ready: true,
    },
  );
});

test("release readiness rejects pending migrations", () => {
  const readiness = evaluateReleaseReadiness({
    existingCheckpointTables: checkpointTables,
    migrationRows: appliedMigrations.slice(0, -1),
  });

  assert.equal(readiness.migrationsReady, false);
  assert.equal(readiness.ready, false);
});

test("release readiness rejects dev markers and incomplete checkpoints", () => {
  const readiness = evaluateReleaseReadiness({
    existingCheckpointTables: checkpointTables.slice(0, -1),
    migrationRows: [
      ...appliedMigrations,
      { batch: -1, name: "dev_push_marker" },
    ],
  });

  assert.equal(readiness.migrationsReady, false);
  assert.equal(readiness.checkpointsReady, false);
  assert.equal(readiness.ready, false);
});
