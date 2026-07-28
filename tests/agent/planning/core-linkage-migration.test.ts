import assert from "node:assert/strict";
import { test } from "node:test";

import {
  down,
  up,
} from "../../../src/migrations/20260728_add_core_timeline_linkage";

type SQLStatement = {
  toQuery: (config: unknown) => { sql: string };
};

const renderStatement = (statement: SQLStatement) =>
  statement.toQuery({
    casing: {},
    escapeName: (name: string) => `"${name}"`,
    escapeParam: (index: number) => `$${index + 1}`,
    escapeString: (value: string) => `'${value}'`,
  }).sql;

const createRecordingDb = () => {
  const statements: string[] = [];

  return {
    db: {
      execute: async (statement: SQLStatement) => {
        statements.push(renderStatement(statement));
      },
    },
    statements,
  };
};

test("core timeline linkage migration deterministically backfills checklist Plan links", async () => {
  const recording = createRecordingDb();

  await up({ db: recording.db } as unknown as Parameters<typeof up>[0]);

  const sql = recording.statements.join("\n");
  assert.match(sql, /ADD COLUMN "related_plan_id" integer/);
  assert.match(sql, /ADD COLUMN "related_schedule_item_id" integer/);
  assert.match(
    sql,
    /UPDATE "timeline_events" AS "timeline_event"\s+SET "related_plan_id" = "checklist"\."plan_id_id"\s+FROM "checklists" AS "checklist"\s+WHERE "timeline_event"\."related_checklist_id" = "checklist"\."id"\s+AND "checklist"\."plan_id_id" IS NOT NULL/i,
  );
  assert.doesNotMatch(sql, /"checklist"\."plan_id"/i);
  assert.match(sql, /INSERT INTO "plans_rels" \("parent_id", "path", "timeline_events_id"\)/);
  assert.match(sql, /SELECT "timeline_event"\."related_plan_id", 'linkedContent', "timeline_event"\."id"/);
  assert.match(sql, /'linkedContent'/);
  assert.match(sql, /NOT EXISTS/i);
  assert.match(sql, /ON DELETE set null/i);
  assert.doesNotMatch(sql, /\btitle\b/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+"timeline_events"/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+"plans_rels"/i);
});

test("core timeline linkage migration down removes only its schema additions", async () => {
  const recording = createRecordingDb();

  await down({ db: recording.db } as unknown as Parameters<typeof down>[0]);

  const sql = recording.statements.join("\n");
  assert.match(sql, /DROP CONSTRAINT "timeline_events_related_plan_id_plans_id_fk"/);
  assert.match(sql, /DROP CONSTRAINT "timeline_events_related_schedule_item_id_schedule_items_id_fk"/);
  assert.match(sql, /DROP INDEX "timeline_events_related_plan_idx"/);
  assert.match(sql, /DROP INDEX "timeline_events_related_schedule_item_idx"/);
  assert.match(sql, /DROP COLUMN "related_plan_id"/);
  assert.match(sql, /DROP COLUMN "related_schedule_item_id"/);
  assert.doesNotMatch(sql, /\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);
  assert.doesNotMatch(sql, /plans_rels/i);
});
