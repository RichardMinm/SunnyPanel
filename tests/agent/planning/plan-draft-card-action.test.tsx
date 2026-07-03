import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("PlanDraftCard prepare button delegates to a callback and remains type button", () => {
  const source = read("src/components/dashboard/agent/PlanDraftCard.tsx");

  assert.match(source, /onPrepareCreate/);
  assert.match(source, /onClick=\{onPrepareCreate\}/);
  assert.match(source, /type="button"/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /pendingAction/);
});

test("MessageCard passes draft prepare callback without constructing pendingAction", () => {
  const source = read("src/components/dashboard/agent/MessageCard.tsx");

  assert.match(source, /onPlanDraftPrepareCreate/);
  assert.match(source, /<PlanDraftCard[\s\S]*onPrepareCreate=\{onPlanDraftPrepareCreate\}/);
  assert.doesNotMatch(source, /pendingAction/);
});

test("AgentConversation forwards draft prepare action to message cards", () => {
  const source = read("src/components/dashboard/agent/AgentConversation.tsx");

  assert.match(source, /onPlanDraftPrepareCreate/);
  assert.match(source, /onPlanDraftPrepareCreate=\{isSubmitting \? undefined : onPlanDraftPrepareCreate\}/);
});

test("AgentWorkbench sends an explicit user intent for draft creation", () => {
  const source = read("src/components/dashboard/agent/AgentWorkbench.tsx");

  assert.match(source, /onSendMessage/);
  assert.match(source, /就按这个草案创建计划/);
  assert.match(source, /void onSendMessage\("就按这个草案创建计划"\)/);
});

test("DashboardPageClient wires draft action to existing agent sendMessage", () => {
  const source = read("src/components/dashboard/DashboardPageClient.tsx");

  assert.match(source, /onSendMessage=\{\(prompt\) => \{ chat\.clearRunDetail\(\); void chat\.sendMessage\(prompt\); \}\}/);
});
