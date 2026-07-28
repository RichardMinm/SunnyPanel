import assert from "node:assert/strict";
import { test } from "node:test";

import { PgDialect } from "drizzle-orm/pg-core";

import {
  buildAtomicAgentRunRollbackClaim,
  executeAtomicAgentRunRollbackClaim,
} from "../../src/lib/agent/rollback-claim";
import * as rollbackClaimModule from "../../src/lib/agent/rollback-claim";

const dialect = new PgDialect();

test("AgentRun rollback claim is one owner-bound parameterized compare-and-set", () => {
  const query = buildAtomicAgentRunRollbackClaim({
    claimToken: "claim-token-123",
    schemaName: "workspace",
    sourceRunId: 12,
    tableName: "workspace_agent_runs",
    updatedAt: "2026-07-28T10:00:00.000Z",
    userId: 7,
  } as never);
  const compiled = dialect.sqlToQuery(query);
  const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

  assert.match(normalizedSql, /^update "workspace"\."workspace_agent_runs" set /i);
  assert.match(normalizedSql, /"rollback_available" = \$\d+/i);
  assert.match(normalizedSql, /"next_action" = \$\d+/i);
  assert.match(normalizedSql, /"trace" = /i);
  assert.match(normalizedSql, /where "id" = \$\d+ and "user_id" = \$\d+ and "rollback_available" = \$\d+/i);
  assert.match(normalizedSql, /'claimTokenHash', md5\(\$\d+\)/i);
  assert.match(normalizedSql, /'state', \$\d+::text/i);
  assert.match(normalizedSql, /'updatedAt', \$\d+::text/i);
  assert.doesNotMatch(normalizedSql, /'claimToken',\s*\$\d+/i);
  assert.equal(compiled.params.includes("claim-token-123"), true);
  assert.equal(compiled.params.includes("in_progress"), true);
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
    claimToken: "claim-token-123",
    sourceRunId: 12,
    updatedAt: "2026-07-28T10:00:00.000Z",
    userId: 7,
  } as never), true);
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
    claimToken: "claim-token-123",
    sourceRunId: 12,
    updatedAt: "2026-07-28T10:00:00.000Z",
    userId: 7,
  } as never), false);
  await assert.rejects(
    executeAtomicAgentRunRollbackClaim({
      adapter: adapter([{ id: 12 }, { id: 12 }]),
      claimToken: "claim-token-123",
      sourceRunId: 12,
      updatedAt: "2026-07-28T10:00:00.000Z",
      userId: 7,
    } as never),
    /unexpected row count/,
  );
});

test("AgentRun rollback terminal transition is one owner-and-token-bound compare-and-set", () => {
  const buildTransition = (
    rollbackClaimModule as unknown as {
      buildAtomicAgentRunRollbackTransition?: (input: unknown) => unknown;
    }
  ).buildAtomicAgentRunRollbackTransition;

  assert.equal(typeof buildTransition, "function");

  const query = buildTransition!({
    claimToken: "claim-token-123",
    expectedState: "in_progress",
    nextAction: "撤销未执行，可重试。",
    nextState: "failed",
    rollbackAvailable: true,
    schemaName: "workspace",
    sourceRunId: 12,
    tableName: "workspace_agent_runs",
    updatedAt: "2026-07-28T10:01:00.000Z",
    userId: 7,
  });
  const compiled = dialect.sqlToQuery(query as never);
  const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

  assert.match(normalizedSql, /^update "workspace"\."workspace_agent_runs" set /i);
  assert.match(normalizedSql, /"rollback_available" = \$\d+/i);
  assert.match(normalizedSql, /"next_action" = \$\d+/i);
  assert.match(normalizedSql, /"trace" = /i);
  assert.match(normalizedSql, /"id" = \$\d+/i);
  assert.match(normalizedSql, /"user_id" = \$\d+/i);
  assert.match(
    normalizedSql,
    /"trace".*'claimTokenHash'.*=\s*md5\(\$\d+\)/i,
  );
  assert.match(normalizedSql, /'state', \$\d+::text/i);
  assert.match(normalizedSql, /'updatedAt', \$\d+::text/i);
  assert.doesNotMatch(normalizedSql, /'claimToken',\s*\$\d+/i);
  assert.match(normalizedSql, /"trace".*'state'.*=\s*\$\d+/i);
  assert.equal(compiled.params.includes("claim-token-123"), true);
  assert.equal(compiled.params.includes("in_progress"), true);
  assert.equal(compiled.params.includes("failed"), true);
  assert.doesNotMatch(compiled.sql, /select/i);
});
