import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("PlanDraftCard continue modify delegates to callback and never executes", () => {
  const source = read("src/components/dashboard/agent/PlanDraftCard.tsx");

  assert.match(source, /onRevise/);
  assert.match(source, /继续修改/);
  assert.match(source, /onClick=\{onRevise\}/);
  assert.match(source, /type="button"/);
  assert.doesNotMatch(source, /onConfirm/);
  assert.doesNotMatch(source, /execute/);
  assert.doesNotMatch(source, /fetch\(/);
});

test("MessageCard passes draft revise callback without constructing pendingAction", () => {
  const source = read("src/components/dashboard/agent/MessageCard.tsx");

  assert.match(source, /onPlanDraftRevise/);
  assert.match(source, /<PlanDraftCard[\s\S]*onRevise=\{onPlanDraftRevise\}/);
  assert.doesNotMatch(source, /pendingAction/);
});

test("AgentConversation forwards draft revise and plan confirmation return-to-edit actions", () => {
  const source = read("src/components/dashboard/agent/AgentConversation.tsx");

  assert.match(source, /onPlanDraftRevise/);
  assert.match(source, /onPlanConfirmationReturnToEdit/);
  assert.match(source, /onPlanDraftRevise=\{isSubmitting \? undefined : onPlanDraftRevise\}/);
  assert.match(source, /onReturnToEdit=\{onPlanConfirmationReturnToEdit/);
});

test("AgentWorkbench wires draft revise to composer prefill and confirmation return-to-edit to sendMessage", () => {
  const source = read("src/components/dashboard/agent/AgentWorkbench.tsx");

  assert.match(source, /我想调整这个计划草案：/);
  assert.match(source, /onInputChange\("我想调整这个计划草案："\)/);
  assert.match(source, /我想返回修改这个计划草案/);
  assert.match(source, /void onSendMessage\("我想返回修改这个计划草案"\)/);
});

test("PlanConfirmationCard return-to-edit remains separate from confirm and cancel", () => {
  const source = read("src/components/dashboard/agent/PlanConfirmationCard.tsx");

  assert.match(source, /onReturnToEdit/);
  assert.match(source, /返回修改/);
  assert.match(source, /onClick=\{onReturnToEdit\}/);
  assert.match(source, /onClick=\{onConfirm\}/);
  assert.match(source, /onClick=\{onCancel\}/);
  assert.doesNotMatch(source, /onReturnToEdit[^]*onConfirm\(/);
});

test("Composer pending return-to-edit can send revise intent without confirming", () => {
  const source = read("src/components/dashboard/agent/AgentComposer.tsx");

  assert.match(source, /onReturnToEditApproval/);
  assert.match(source, /handleReturnToEdit/);
  assert.match(source, /返回修改/);
  assert.match(source, /onClick=\{handleReturnToEdit\}/);
  assert.doesNotMatch(source, /handleReturnToEdit[^]*onConfirmApproval\(/);
});
