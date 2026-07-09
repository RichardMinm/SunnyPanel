import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  buildPlansByIdMap,
  resolveChecklistPlanId,
} from "../../../src/components/dashboard/agent/utils";

const read = (filePath: string) => readFileSync(filePath, "utf8");

/* ── resolveChecklistPlanId: schedule use case ── */

test("resolveChecklistPlanId: schedule-related-plan as number → number", () => {
  assert.equal(resolveChecklistPlanId(88), 88);
});

test("resolveChecklistPlanId: schedule-related-plan as populated object → number", () => {
  assert.equal(resolveChecklistPlanId({ id: 88 }), 88);
});

test("resolveChecklistPlanId: schedule-related-plan null → null", () => {
  assert.equal(resolveChecklistPlanId(null), null);
});

test("resolveChecklistPlanId: schedule-related-checklist as number → number", () => {
  assert.equal(resolveChecklistPlanId(42), 42);
});

/* ── buildPlansByIdMap: works for both plans and checklists ── */

test("buildPlansByIdMap with plan docs → id→{id,title} map", () => {
  const map = buildPlansByIdMap([{ id: 88, title: "Sprint Plan" }]);
  assert.deepEqual(map.get(88), { id: 88, title: "Sprint Plan" });
});

test("buildPlansByIdMap with checklist docs → id→{id,title} map", () => {
  const map = buildPlansByIdMap([{ id: 42, title: "Daily Tasks" }]);
  assert.deepEqual(map.get(42), { id: 42, title: "Daily Tasks" });
});

test("buildPlansByIdMap: empty → empty map", () => {
  assert.equal(buildPlansByIdMap([]).size, 0);
});

/* ── Summary resolution: combined plan + checklist lookup ── */

test("schedule summary: relatedPlan resolved from plansById map", () => {
  const plansById = buildPlansByIdMap([{ id: 88, title: "Sprint Plan" }]);
  const planId = resolveChecklistPlanId(88);
  assert.equal(planId, 88);
  const relatedPlan = planId !== null ? (plansById.get(planId) ?? null) : null;
  assert.deepEqual(relatedPlan, { id: 88, title: "Sprint Plan" });
});

test("schedule summary: relatedChecklist resolved from checklistsById map", () => {
  const checklistsById = buildPlansByIdMap([{ id: 42, title: "Daily Tasks" }]);
  const checklistId = resolveChecklistPlanId(42);
  assert.equal(checklistId, 42);
  const relatedChecklist = checklistId !== null ? (checklistsById.get(checklistId) ?? null) : null;
  assert.deepEqual(relatedChecklist, { id: 42, title: "Daily Tasks" });
});

test("schedule summary: relatedPlan missing → null", () => {
  const plansById = buildPlansByIdMap([{ id: 1, title: "Other" }]);
  const planId = resolveChecklistPlanId(404);
  assert.equal(planId, 404);
  const relatedPlan = plansById.get(planId) ?? null;
  assert.equal(relatedPlan, null);
});

test("schedule summary: relatedChecklist missing → null", () => {
  const checklistsById = buildPlansByIdMap([]);
  const checklistId = resolveChecklistPlanId(99);
  assert.equal(checklistId, 99);
  const relatedChecklist = checklistsById.get(checklistId) ?? null;
  assert.equal(relatedChecklist, null);
});

test("schedule summary: both plan and checklist null → both null", () => {
  const planId = resolveChecklistPlanId(null);
  const checklistId = resolveChecklistPlanId(null);
  assert.equal(planId, null);
  assert.equal(checklistId, null);
});

/* ── No private data leakage ── */

test("schedule summary: relatedPlan returns only id and title", () => {
  const plansById = buildPlansByIdMap([{ id: 88, title: "Sprint Plan" }]);
  const result = plansById.get(88);
  assert.ok(result !== undefined);
  if (!result) return;
  const keys = Object.keys(result).sort();
  assert.deepEqual(keys, ["id", "title"]);
  assert.equal((result as Record<string, unknown>).progress, undefined);
  assert.equal((result as Record<string, unknown>).status, undefined);
  assert.equal((result as Record<string, unknown>).state, undefined);
});

test("schedule summary: relatedChecklist returns only id and title", () => {
  const checklistsById = buildPlansByIdMap([{ id: 42, title: "Daily Tasks" }]);
  const result = checklistsById.get(42);
  assert.ok(result !== undefined);
  if (!result) return;
  const keys = Object.keys(result).sort();
  assert.deepEqual(keys, ["id", "title"]);
  assert.equal((result as Record<string, unknown>).groups, undefined);
  assert.equal((result as Record<string, unknown>).status, undefined);
});

/* ── UI source: linkage fields rendered in ScheduleMonthView ── */

test("ScheduleMonthView source: linkage fields are rendered in expanded card", () => {
  const source = read("src/components/dashboard/schedule/ScheduleMonthView.tsx");

  // Type includes the new optional fields
  assert.ok(source.includes("relatedPlan"), "ScheduleItemSummary must include relatedPlan");
  assert.ok(source.includes("relatedChecklist"), "ScheduleItemSummary must include relatedChecklist");
  assert.ok(source.includes("relatedChecklistItemKey"), "ScheduleItemSummary must include relatedChecklistItemKey");
  assert.ok(source.includes("conflictNote"), "ScheduleItemSummary must include conflictNote");

  // Expanded view renders linkage only when present (conditional rendering)
  assert.ok(source.includes("item.relatedPlan &&"), "relatedPlan must be conditionally rendered");
  assert.ok(source.includes("item.relatedChecklist &&"), "relatedChecklist must be conditionally rendered");
  assert.ok(source.includes("item.relatedChecklistItemKey &&"), "relatedChecklistItemKey must be conditionally rendered");
  assert.ok(source.includes("item.conflictNote &&"), "conflictNote must be conditionally rendered");

  // Correct copy for linkage labels
  assert.ok(source.includes("所属计划"), "must show 所属计划 label");
  assert.ok(source.includes("关联清单"), "must show 关联清单 label");
  assert.ok(source.includes("清单项"), "must show 清单项 label");
  assert.ok(source.includes("冲突备注"), "must show 冲突备注 label");
});

/* ── Schedule API route: linkage resolution in GET handler ── */

test("schedule API route source: resolves relatedPlan and relatedChecklist", () => {
  const source = read("src/app/api/agent/schedule/route.ts");

  // Uses depth: 1 to populate relationships
  assert.ok(source.includes("depth: 1"), "API must use depth: 1 to populate relationships");

  // Uses resolveChecklistPlanId for both plan and checklist lookup
  assert.ok(source.includes("resolveChecklistPlanId"), "API must use resolveChecklistPlanId");

  // Batch queries plans
  assert.ok(source.includes('collection: "plans"'), "API must batch-query plans");

  // Batch queries checklists
  assert.ok(source.includes('collection: "checklists"'), "API must batch-query checklists");

  // Returns relatedPlan with title
  assert.ok(source.includes("relatedPlan"), "API response must include relatedPlan");

  // Returns relatedChecklist with title
  assert.ok(source.includes("relatedChecklist"), "API response must include relatedChecklist");

  // Returns relatedChecklistItemKey
  assert.ok(source.includes("relatedChecklistItemKey"), "API response must include relatedChecklistItemKey");

  // Returns conflictNote
  assert.ok(source.includes("conflictNote"), "API response must include conflictNote");

  // Missing docs → null (uses ?? null pattern)
  assert.ok(source.includes("?? null"), "API must return null for missing docs");
});

/* ── Copy boundary: no misleading copy in Dashboard UI ── */

test("copy boundary: ScheduleMonthView does not claim auto-reschedule, external calendar, or enterprise audit", () => {
  const source = read("src/components/dashboard/schedule/ScheduleMonthView.tsx");
  assert.doesNotMatch(source, /自动重排/);
  assert.doesNotMatch(source, /外部日历/);
  assert.doesNotMatch(source, /企业审计/);
  assert.doesNotMatch(source, /全自动执行/);
  assert.doesNotMatch(source, /分布式事务/);
});

test("copy boundary: ChecklistView does not claim auto-reschedule or full automation", () => {
  const source = read("src/components/dashboard/checklist/ChecklistView.tsx");
  assert.doesNotMatch(source, /自动重排/);
  assert.doesNotMatch(source, /企业审计/);
  assert.doesNotMatch(source, /全自动执行/);
});

test("copy boundary: AgentApprovalCard uses safe scheduling language", () => {
  const source = read("src/components/dashboard/agent/AgentApprovalCard.tsx");
  // Existing safe copy verified
  assert.match(source, /系统不会自动重排/);
  assert.match(source, /未包含外部日历/);
  // No misleading claims
  assert.doesNotMatch(source, /全自动/);
  assert.doesNotMatch(source, /企业/);
});

/* ── ChecklistView: relatedPlan display ── */

test("ChecklistView source: renders relatedPlan when present", () => {
  const source = read("src/components/dashboard/checklist/ChecklistView.tsx");

  // Type includes relatedPlan
  assert.ok(source.includes("relatedPlan"), "ChecklistView type must include relatedPlan");

  // Renders plan title with label (conditional)
  assert.ok(source.includes("relatedPlan.title"), "must display relatedPlan.title");
  assert.ok(source.includes("关联"), "must label as 关联");

  // Conditional rendering — no empty row for standalone checklists
  assert.ok(source.includes("cl.relatedPlan ?"), "relatedPlan must be conditionally rendered");
});

/* ── Dashboard agent safety keywords ── */

test("dashboard agent safety keywords: draft, confirmation, receipt, rollback states visible in source", () => {
  const actionCard = read("src/components/dashboard/agent/ActionResultCard.tsx");
  const approvalCard = read("src/components/dashboard/agent/AgentApprovalCard.tsx");
  const planDraft = read("src/components/dashboard/agent/PlanDraftCard.tsx");

  // Draft state
  assert.match(planDraft, /尚未写入数据库/);
  assert.match(planDraft, /草案/);

  // Confirmation state
  assert.match(approvalCard, /等待确认/);

  // Receipt / rollback state
  assert.match(actionCard, /撤销|rollback|Rollback/);
  assert.match(actionCard, /操作记录|Receipt|receipt/);
});
