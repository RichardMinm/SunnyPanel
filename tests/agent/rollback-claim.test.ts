import assert from "node:assert/strict";
import { test } from "node:test";

import { PgDialect } from "drizzle-orm/pg-core";

import {
  buildAtomicAgentRunRollbackClaim,
  executeAtomicAgentRunRollbackClaim,
} from "../../src/lib/agent/rollback-claim";

const dialect = new PgDialect();

test("AgentRun rollback claim is one owner-bound parameterized compare-and-set", () => {
  const query = buildAtomicAgentRunRollbackClaim({
    schemaName: "workspace",
    sourceRunId: 12,
    tableName: "workspace_agent_runs",
    updatedAt: "2026-07-28T10:00:00.000Z",
    userId: 7,
  });
  const compiled = dialect.sqlToQuery(query);
  const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

  assert.match(
    normalizedSql,
    /^update "workspace"\."workspace_agent_runs" set "rollback_available" = \$1, "updated_at" = \$2 where "id" = \$3 and "user_id" = \$4 and "rollback_available" = \$5 returning "id"$/i,
  );
  assert.deepEqual(compiled.params, [
    false,
    "2026-07-28T10:00:00.000Z",
    12,
    7,
    true,
  ]);
  assert.doesNotMatch(compiled.sql, /select/i);
});

test("AgentRun rollback claim uses primary Drizzle and accepts exactly one owned row", async () => {
  const primaryQueries: unknown[] = [];
  const replicaQueries: unknown[] = [];
  const adapter = {
    drizzle: {
      execute: async (query: unknown) => {
        replicaQueries.push(query);
        return { rows: [] };
      },
    },
    primaryDrizzle: {
      execute: async (query: unknown) => {
        primaryQueries.push(query);
        return { rows: [{ id: 12 }] };
      },
    },
    schemaName: "workspace",
    tableNameMap: new Map([["agent_runs", "workspace_agent_runs"]]),
  };

  assert.equal(await executeAtomicAgentRunRollbackClaim({
    adapter,
    sourceRunId: 12,
    updatedAt: "2026-07-28T10:00:00.000Z",
    userId: 7,
  }), true);
  assert.equal(primaryQueries.length, 1);
  assert.equal(replicaQueries.length, 0);
});

test("AgentRun rollback claim maps no row to unavailable and rejects ambiguous rows", async () => {
  const adapter = (rows: unknown[]) => ({
    drizzle: { execute: async () => ({ rows }) },
    tableNameMap: new Map([["agent_runs", "agent_runs"]]),
  });

  assert.equal(await executeAtomicAgentRunRollbackClaim({
    adapter: adapter([]),
    sourceRunId: 12,
    updatedAt: "2026-07-28T10:00:00.000Z",
    userId: 7,
  }), false);
  await assert.rejects(
    executeAtomicAgentRunRollbackClaim({
      adapter: adapter([{ id: 12 }, { id: 12 }]),
      sourceRunId: 12,
      updatedAt: "2026-07-28T10:00:00.000Z",
      userId: 7,
    }),
    /unexpected row count/,
  );
});
