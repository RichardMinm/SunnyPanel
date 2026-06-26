import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeRouterOutput } from "../../src/lib/agent/router/normalize-router-output";
import type { AgentIntent } from "../../src/lib/agent/schemas";

test("extractTarget returns entityType plan for create_plan", () => {
  const intent: AgentIntent = {
    args: { title: "新计划" },
    intent: "create_plan",
  };
  const output = normalizeRouterOutput({ intent });
  assert.equal(output.target.entityType, "plan");
});

test("extractTarget returns entityType schedule for compose_schedule_item", () => {
  const intent: AgentIntent = {
    args: { date: "2026-07-01", title: "新日程" },
    intent: "compose_schedule_item",
  };
  const output = normalizeRouterOutput({ intent });
  assert.equal(output.target.entityType, "schedule");
});

test("extractTarget returns entityType timeline for compose_timeline_event", () => {
  const intent: AgentIntent = {
    args: { itemTitle: "新事件" },
    intent: "compose_timeline_event",
  };
  const output = normalizeRouterOutput({ intent });
  assert.equal(output.target.entityType, "timeline");
});

test("extractTarget returns entityType writing for draft_writing_outline", () => {
  const intent = {
    args: { title: "新文章" },
    intent: "draft_writing_outline",
  } as unknown as AgentIntent;
  const output = normalizeRouterOutput({ intent });
  assert.equal(output.target.entityType, "writing");
});

test("extractTarget returns entityType checklist for draft_checklist", () => {
  const intent = {
    args: { title: "新清单" },
    intent: "draft_checklist",
  } as unknown as AgentIntent;
  const output = normalizeRouterOutput({ intent });
  assert.equal(output.target.entityType, "checklist");
});

test("extractTarget still returns entityType for delete_record", () => {
  const intent: AgentIntent = {
    args: { entityName: "计划A", entityType: "plan" },
    intent: "delete_record",
  };
  const output = normalizeRouterOutput({ intent });
  assert.equal(output.target.entityType, "plan");
  assert.equal(output.target.entityName, "计划A");
});
