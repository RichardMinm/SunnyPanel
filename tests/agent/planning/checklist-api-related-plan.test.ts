import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPlansByIdMap,
  getChecklistRelatedPlan,
  resolveChecklistPlanId,
} from "../../../src/components/dashboard/agent/utils";

/* ── resolveChecklistPlanId ── */

test("resolveChecklistPlanId: number planId → number", () => {
  assert.equal(resolveChecklistPlanId(88), 88);
  assert.equal(resolveChecklistPlanId(1), 1);
});

test("resolveChecklistPlanId: object planId { id: N } → number", () => {
  assert.equal(resolveChecklistPlanId({ id: 88 }), 88);
});

test("resolveChecklistPlanId: null → null", () => {
  assert.equal(resolveChecklistPlanId(null), null);
});

test("resolveChecklistPlanId: undefined → null", () => {
  assert.equal(resolveChecklistPlanId(undefined), null);
});

test("resolveChecklistPlanId: object without id → null", () => {
  assert.equal(resolveChecklistPlanId({}), null);
  assert.equal(resolveChecklistPlanId({ title: "x" }), null);
});

/* ── buildPlansByIdMap ── */

test("buildPlansByIdMap: builds id → { id, title } map", () => {
  const map = buildPlansByIdMap([
    { id: 88, title: "Sprint Plan" },
    { id: 42, title: "Side Project" },
  ]);
  assert.equal(map.size, 2);
  assert.deepEqual(map.get(88), { id: 88, title: "Sprint Plan" });
  assert.deepEqual(map.get(42), { id: 42, title: "Side Project" });
});

test("buildPlansByIdMap: empty array → empty map", () => {
  const map = buildPlansByIdMap([]);
  assert.equal(map.size, 0);
});

test("buildPlansByIdMap: missing title → empty string", () => {
  const map = buildPlansByIdMap([{ id: 1 }]);
  assert.deepEqual(map.get(1), { id: 1, title: "" });
});

/* ── getChecklistRelatedPlan: with planId ── */

test("getChecklistRelatedPlan: planId=88 + Plan 88 exists → { id, title }", () => {
  const plansById = buildPlansByIdMap([{ id: 88, title: "Sprint Plan" }]);
  const result = getChecklistRelatedPlan(88, plansById);
  assert.deepEqual(result, { id: 88, title: "Sprint Plan" });
});

test("getChecklistRelatedPlan: planId as object { id: 88 } + Plan exists → { id, title }", () => {
  const plansById = buildPlansByIdMap([{ id: 88, title: "Sprint Plan" }]);
  const result = getChecklistRelatedPlan({ id: 88 }, plansById);
  assert.deepEqual(result, { id: 88, title: "Sprint Plan" });
});

/* ── getChecklistRelatedPlan: without planId ── */

test("getChecklistRelatedPlan: planId=null → null", () => {
  const plansById = buildPlansByIdMap([{ id: 88, title: "Sprint Plan" }]);
  const result = getChecklistRelatedPlan(null, plansById);
  assert.equal(result, null);
});

test("getChecklistRelatedPlan: planId=undefined → null", () => {
  const plansById = buildPlansByIdMap([{ id: 88, title: "Sprint Plan" }]);
  const result = getChecklistRelatedPlan(undefined, plansById);
  assert.equal(result, null);
});

/* ── getChecklistRelatedPlan: plan not found ── */

test("getChecklistRelatedPlan: planId=404 + Plan 404 missing → null", () => {
  const plansById = buildPlansByIdMap([{ id: 88, title: "Sprint Plan" }]);
  const result = getChecklistRelatedPlan(404, plansById);
  assert.equal(result, null);
});

test("getChecklistRelatedPlan: planId=88 + empty plansById map → null", () => {
  const plansById = buildPlansByIdMap([]);
  const result = getChecklistRelatedPlan(88, plansById);
  assert.equal(result, null);
});

/* ── No private data leakage ── */

test("getChecklistRelatedPlan: returns only id and title — no progress, state, status, visibility, linkedContent", () => {
  // Simulate a plan document with extra fields that should NOT appear in output
  const plansById = buildPlansByIdMap([{ id: 88, title: "Sprint Plan" }]);
  const result = getChecklistRelatedPlan(88, plansById);

  assert.ok(result !== null);
  if (result === null) return; // type guard for TS

  // Only id and title should be present
  const keys = Object.keys(result).sort();
  assert.deepEqual(keys, ["id", "title"]);

  // Verify no extra fields leak
  assert.equal((result as Record<string, unknown>).progress, undefined);
  assert.equal((result as Record<string, unknown>).state, undefined);
  assert.equal((result as Record<string, unknown>).status, undefined);
  assert.equal((result as Record<string, unknown>).visibility, undefined);
  assert.equal((result as Record<string, unknown>).linkedContent, undefined);
  assert.equal((result as Record<string, unknown>).priority, undefined);
  assert.equal((result as Record<string, unknown>).dueDate, undefined);
  assert.equal((result as Record<string, unknown>).agentBrief, undefined);
  assert.equal((result as Record<string, unknown>).description, undefined);
});

/* ── parsePlanOverview: Chinese plan creation patterns ── */

test("parsePlanOverview: 「已创建计划」 pattern matches", async () => {
  const { parsePlanOverview } = await import("../../../src/components/dashboard/agent/utils");
  const result = parsePlanOverview("已创建计划「秋招准备」。我已经把目标、关键步骤写进计划详情。");
  assert.ok(result !== null);
  assert.equal(result!.title, "秋招准备");
  assert.equal(result!.progress, undefined);
});

test("parsePlanOverview: 「已创建完整计划」 pattern matches", async () => {
  const { parsePlanOverview } = await import("../../../src/components/dashboard/agent/utils");
  const result = parsePlanOverview("已创建完整计划「SunnyPanel Demo」（3 个阶段，14 天）。我已经把目标、关键步骤、验收标准、风险和 Agent Brief 写进计划详情。");
  assert.ok(result !== null);
  assert.equal(result!.title, "SunnyPanel Demo");
  assert.equal(result!.phaseCount, 3);
  assert.equal(result!.estimatedDays, 14);
  assert.equal(result!.progress, undefined);
});

test("parsePlanOverview: 「已帮你创建计划」 pattern matches", async () => {
  const { parsePlanOverview } = await import("../../../src/components/dashboard/agent/utils");
  const result = parsePlanOverview('已帮你创建计划「考研复盘」。目前它会以私有草稿的形式进入待办队列，默认状态是“待开始”。');
  assert.ok(result !== null);
  assert.equal(result!.title, "考研复盘");
  assert.equal(result!.progress, undefined);
});

test("parsePlanOverview: non-plan text returns null", async () => {
  const { parsePlanOverview } = await import("../../../src/components/dashboard/agent/utils");
  assert.equal(parsePlanOverview("今天天气怎么样？"), null);
  assert.equal(parsePlanOverview("帮我查一下最近的日程"), null);
  assert.equal(parsePlanOverview(""), null);
});

test("parsePlanOverview: estimatedDays from parenthetical format （N 个阶段，M 天）", async () => {
  const { parsePlanOverview } = await import("../../../src/components/dashboard/agent/utils");
  const result = parsePlanOverview("已创建完整计划「Demo」（3 个阶段，14 天）。详情...");
  assert.ok(result !== null);
  assert.equal(result!.phaseCount, 3);
  assert.equal(result!.estimatedDays, 14);
});

test("parsePlanOverview: estimatedDays from 预计 N 天 format (existing)", async () => {
  const { parsePlanOverview } = await import("../../../src/components/dashboard/agent/utils");
  // The "预计 N 天" pattern is in the full text alongside the creation pattern
  const result = parsePlanOverview("已创建计划「Demo」。预计 21 天完成。");
  assert.ok(result !== null);
  assert.equal(result!.estimatedDays, 21);
});

test("parsePlanOverview: no days field → estimatedDays undefined", async () => {
  const { parsePlanOverview } = await import("../../../src/components/dashboard/agent/utils");
  const result = parsePlanOverview("已创建计划「Simple Plan」。这是一个简单的计划。");
  assert.ok(result !== null);
  assert.equal(result!.estimatedDays, undefined);
  assert.equal(result!.progress, undefined);
});

test("parsePlanOverview: progress is never populated (no DB access, no fabrication)", async () => {
  const { parsePlanOverview } = await import("../../../src/components/dashboard/agent/utils");

  // All Chinese creation patterns
  const p1 = parsePlanOverview("已创建计划「Test」");
  assert.ok(p1 !== null);
  assert.equal(p1!.progress, undefined);

  const p2 = parsePlanOverview("已创建完整计划「Test」");
  assert.ok(p2 !== null);
  assert.equal(p2!.progress, undefined);

  const p3 = parsePlanOverview("已帮你创建计划「Test」");
  assert.ok(p3 !== null);
  assert.equal(p3!.progress, undefined);

  // Heading pattern
  const p4 = parsePlanOverview("## 计划：Launch Prep\n\n### 1. Research\n\n### 2. Build");
  assert.ok(p4 !== null);
  assert.equal(p4!.progress, undefined);

  // English heading
  const p5 = parsePlanOverview("## Plan: Q3 Roadmap\n\n### 1. Planning\n\n### 2. Execution");
  assert.ok(p5 !== null);
  assert.equal(p5!.progress, undefined);

  // Inline "Plan: ..." pattern
  const p6 = parsePlanOverview("Plan: Content Migration\n\n### 1. Audit\n\n### 2. Migrate");
  assert.ok(p6 !== null);
  assert.equal(p6!.progress, undefined);

  // Numbered phases
  const p7 = parsePlanOverview("计划\n\n第一步：准备\n\n第二步：实施\n\n第三步：验收");
  assert.ok(p7 !== null);
  assert.equal(p7!.progress, undefined);
});
