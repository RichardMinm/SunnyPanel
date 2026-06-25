import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const packageJson = JSON.parse(
  readFileSync("package.json", "utf8"),
) as {
  scripts?: Record<string, string>;
};

const readInitialMigration = () => {
  const migrationDirectory = resolve(
    process.cwd(),
    "src/migrations",
  );
  const migrationFile = readdirSync(migrationDirectory)
    .filter(
      (file) =>
        file.endsWith(".ts") && file !== "index.ts",
    )
    .sort()[0];

  assert.ok(migrationFile, "an initial migration must exist");

  return readFileSync(
    resolve(migrationDirectory, migrationFile),
    "utf8",
  );
};

test("Agent test script provides a non-production Payload secret", () => {
  const script = packageJson.scripts?.["test:agent"] ?? "";

  assert.match(
    script,
    /PAYLOAD_SECRET=['"]?[^'"\s]{24,}/,
    "test:agent must provide a strong test-only PAYLOAD_SECRET",
  );
});

test("checkpoint setup is an explicit deployment command", () => {
  const script = packageJson.scripts?.["agent:checkpoint:setup"] ?? "";

  assert.match(script, /setup-langgraph-checkpoints\.ts/);
});

test("Agent runtime E2E covers the remaining migration-critical HTTP paths", () => {
  const command = packageJson.scripts?.["test:agent:e2e"] ?? "";
  const script = readFileSync(
    resolve(process.cwd(), "scripts/agent-runtime-e2e.mjs"),
    "utf8",
  );

  assert.match(command, /agent-runtime-e2e\.mjs/);
  assert.match(script, /stream:\s*false/);
  assert.match(script, /stream:\s*true/);
  assert.match(script, /deepStrictEqual/);
  assert.match(script, /confirmation:\s*\{/);
  assert.match(script, /await_confirmation/);
  assert.match(script, /await_batch_confirmation/);
  assert.match(script, /modify_record/);
  assert.match(script, /cancel_schedule_item/);
  assert.match(script, /await_queue_resume/);
  assert.match(script, /controlledFailure/);
  assert.match(script, /unwrapDocument/);
  assert.match(script, /return unwrapDocument\(await response\.json\(\)\)/);
});

test("action receipt migration cascades required user and thread relations", () => {
  const migration = readInitialMigration();

  assert.doesNotMatch(
    migration,
    /agent_action_receipts_user_id_users_id_fk[^\n]*ON DELETE set null/,
  );
  assert.doesNotMatch(
    migration,
    /agent_action_receipts_thread_id_agent_threads_id_fk[^\n]*ON DELETE set null/,
  );
  assert.match(
    migration,
    /agent_action_receipts_user_id_users_id_fk[^\n]*ON DELETE cascade/,
  );
  assert.match(
    migration,
    /agent_action_receipts_thread_id_agent_threads_id_fk[^\n]*ON DELETE cascade/,
  );
});

test("full migration creates the append-only Agent thread event store", () => {
  const migration = readInitialMigration();
  const payloadConfig = readFileSync(
    resolve(process.cwd(), "payload.config.ts"),
    "utf8",
  );

  assert.match(migration, /CREATE TABLE "agent_thread_events"/);
  assert.match(migration, /agent_thread_events_event_key_idx/);
  assert.match(
    migration,
    /agent_thread_events_thread_id_agent_threads_id_fk[^\n]*ON DELETE cascade/,
  );
  assert.match(
    migration,
    /agent_thread_events_user_id_users_id_fk[^\n]*ON DELETE cascade/,
  );
  assert.match(payloadConfig, /AgentThreadEvent/);
});

test("initial Payload migration is runnable against an empty PostgreSQL database", () => {
  const migration = readInitialMigration();
  const usersTableIndex = migration.indexOf(
    'CREATE TABLE "users"',
  );
  const threadsTableIndex = migration.indexOf(
    'CREATE TABLE "agent_threads"',
  );
  const receiptForeignKeyIndex = migration.indexOf(
    "agent_action_receipts_user_id_users_id_fk",
  );

  assert.ok(
    usersTableIndex >= 0,
    "the first migration must create users on an empty database",
  );
  assert.ok(
    threadsTableIndex >= 0,
    "the first migration must create agent_threads on an empty database",
  );
  assert.ok(
    usersTableIndex < receiptForeignKeyIndex &&
      threadsTableIndex < receiptForeignKeyIndex,
    "base tables must be created before Agent receipt foreign keys",
  );
});
