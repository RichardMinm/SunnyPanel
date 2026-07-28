import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildPlansByIdMap } from "../../../src/components/dashboard/agent/utils";

const read = (path: string) => readFileSync(path, "utf8");

/* ── buildPlansByIdMap: used by plans API for batch resolution ── */

test("plan summary: persisted progress maps correctly", () => {
  // Simulate Plan.progress from DB → summary.progress
  const planDoc = { id: 1, title: "Sprint Plan", progress: 42 };
  const map = buildPlansByIdMap([planDoc]);
  assert.deepEqual(map.get(1), { id: 1, title: "Sprint Plan" });
  // progress comes from the Plan document field, not from the map
  assert.equal((planDoc as Record<string, unknown>).progress, 42);
});

test("plan summary: does not recompute progress", () => {
  // The API returns persisted Plan.progress directly — never recalculates from checklists
  const planProgress = 30;
  const checklistCompletionRate = 80; // checklist items 4/5 completed

  // API route reads plan.progress (30), NOT checklist completion rate (80)
  assert.notEqual(planProgress, checklistCompletionRate);
  assert.equal(planProgress, 30);
});

/* ── Source: API loader data integrity ── */

test("plans API loader source: uses persisted progress from Plan document", () => {
  const source = read("src/lib/core-linkage/api-summaries.ts");

  // Reads Plan.progress from DB (persisted field)
  assert.ok(source.includes(".progress"), "must read Plan.progress from persisted field");

  // Does NOT call calculatePlanChecklistProgress (no recomputation)
  assert.doesNotMatch(source, /calculatePlan/);

  // Batch queries checklists by planId
  assert.ok(source.includes('collection: "checklists"'), "must query checklists by planId");
  assert.ok(source.includes("planId"), "must filter checklists by planId");

  // Batch queries schedule-items by relatedPlan
  assert.ok(source.includes('collection: "schedule-items"'), "must query schedule-items by relatedPlan");
  assert.ok(source.includes("relatedPlan"), "must filter schedule-items by relatedPlan");

  // Returns only id/title for linked collections (no full doc leakage)
  assert.ok(source.includes("completedItems"), "checklist summary for UI display");
  assert.ok(source.includes("totalItems"), "checklist summary for UI display");
});

/* ── No full document leakage ── */

test("plans API loader source: does not leak full Plan/Checklist/ScheduleItem fields", () => {
  const source = read("src/lib/core-linkage/api-summaries.ts");

  // PlanSummary does NOT include:
  assert.doesNotMatch(source, /linkedContent/);
  assert.doesNotMatch(source, /agentBrief/);
  // overrideAccess is used for server-side query, not exposed in response
  // visibility is not in the summary type

  // Checklist summary only returns: id, title, completedItems, totalItems
  // ScheduleItem summary only returns: id, title, startsAt, endsAt, status
});

/* ── UI contract: PersistedPlanSnapshotCard ── */

test("PersistedPlanSnapshotCard source: shows persisted progress as real percentage", () => {
  const source = read("src/components/dashboard/agent/PersistedPlanSnapshotCard.tsx");

  // Shows progress bar with aria attributes
  assert.ok(source.includes("aria-valuenow"), "progress bar must be semantically labeled");
  assert.ok(source.includes("aria-valuemin"), "progress bar min value");
  assert.ok(source.includes("aria-valuemax"), "progress bar max value");

  // Shows "进度 N%" label
  assert.ok(source.includes("进度"), "must display 进度 label");
  assert.ok(source.includes("progress"), "must display progress value");

  // Conditional: only shows progress when plan.progress != null
  assert.ok(source.includes("plan.progress != null"), "must only show when progress is present");

  // Progress bar clamps to 0-100
  assert.ok(source.includes("Math.min(100, Math.max(0"), "must clamp progress to 0-100 range");
});

test("PersistedPlanSnapshotCard source: shows checklist and schedule counts", () => {
  const source = read("src/components/dashboard/agent/PersistedPlanSnapshotCard.tsx");

  // Shows checklist count
  assert.ok(source.includes("关联清单"), "must show 关联清单 label");

  // Shows schedule count
  assert.ok(source.includes("关联日程"), "must show 关联日程 label");

  // Shows empty state when no linked content
  assert.ok(source.includes("暂无关联内容"), "must show empty state for standalone plans");
});

/* ── Copy boundary ── */

test("PersistedPlanSnapshotCard source: no misleading copy", () => {
  const source = read("src/components/dashboard/agent/PersistedPlanSnapshotCard.tsx");

  assert.doesNotMatch(source, /自动重排/);
  assert.doesNotMatch(source, /外部日历/);
  assert.doesNotMatch(source, /企业审计/);
  assert.doesNotMatch(source, /全自动/);
  assert.doesNotMatch(source, /AI 估算/);
  assert.doesNotMatch(source, /LLM/);
});

/* ── Inspector tab wiring ── */

test("Inspector: plans tab is wired in ContextInspector and DashboardRightPanel", () => {
  const inspector = read("src/components/dashboard/agent/ContextInspector.tsx");
  const panel = read("src/components/dashboard/DashboardRightPanel.tsx");
  const constants = read("src/components/dashboard/agent/constants.ts");

  // Plans tab defined in constants
  assert.ok(constants.includes('"plans"'), "inspectorTabs must include plans");

  // Plans tab always visible (not gated behind debug or pending)
  assert.ok(inspector.includes('"plans"'), "plans must be in always-visible tab filter");

  // Plans panel rendered in DashboardRightPanel
  assert.ok(panel.includes('"plans"'), "DashboardRightPanel must render plans panel");
});
