import assert from "node:assert/strict";
import { test } from "node:test";

import { PgDialect } from "drizzle-orm/pg-core";

import {
  buildAtomicScheduleStatusUpdate,
  executeAtomicScheduleStatusUpdate,
} from "../../../src/lib/schedule/atomic-schedule-status-update";

const dialect = new PgDialect();

test("atomic Schedule SQL is one parameterized update against the configured schema table", () => {
  const query = buildAtomicScheduleStatusUpdate({
    itemId: 11,
    schemaName: "workspace",
    status: "planned",
    tableName: "calendar_schedule_items",
    updatedAt: "2026-07-28T10:00:00.000Z",
  });
  const compiled = dialect.sqlToQuery(query);
  const normalizedSql = compiled.sql.replace(/\s+/g, " ").trim();

  assert.match(normalizedSql, /^update "workspace"\."calendar_schedule_items" set "status" = \$1, "updated_at" = \$2 where "id" = \$3 and "status" <> \$4 returning "id", "status"$/i);
  assert.deepEqual(compiled.params, ["planned", "2026-07-28T10:00:00.000Z", 11, "done"]);
  assert.doesNotMatch(compiled.sql, /select/i);
});

test("atomic Schedule executor uses primary Drizzle and returns its one valid row", async () => {
  const primaryQueries: unknown[] = [];
  const replicaQueries: unknown[] = [];
  const result = await executeAtomicScheduleStatusUpdate({
    adapter: {
      drizzle: { execute: async (query: unknown) => { replicaQueries.push(query); return { rows: [] }; } },
      primaryDrizzle: {
        execute: async (query: unknown) => {
          primaryQueries.push(query);
          return { rows: [{ id: 11, status: "planned" }] };
        },
      },
      schemaName: "workspace",
      tableNameMap: new Map([["schedule_items", "calendar_schedule_items"]]),
    },
    itemId: 11,
    status: "planned",
    updatedAt: "2026-07-28T10:00:00.000Z",
  });

  assert.deepEqual(result, { id: 11, status: "planned" });
  assert.equal(primaryQueries.length, 1);
  assert.equal(replicaQueries.length, 0);
});

test("atomic Schedule executor maps zero rows to null and rejects ambiguous results", async () => {
  const makeAdapter = (rows: unknown[]) => ({
    drizzle: { execute: async () => ({ rows }) },
    tableNameMap: new Map([["schedule_items", "schedule_items"]]),
  });

  assert.equal(await executeAtomicScheduleStatusUpdate({
    adapter: makeAdapter([]),
    itemId: 11,
    status: "planned",
    updatedAt: "2026-07-28T10:00:00.000Z",
  }), null);

  await assert.rejects(
    executeAtomicScheduleStatusUpdate({
      adapter: makeAdapter([{ id: 11, status: "planned" }, { id: 12, status: "planned" }]),
      itemId: 11,
      status: "planned",
      updatedAt: "2026-07-28T10:00:00.000Z",
    }),
    /unexpected row count/,
  );
});
