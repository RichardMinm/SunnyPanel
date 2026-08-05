import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const conversationPath = "src/components/dashboard/agent/AgentConversation.tsx";
const messageCardPath = "src/components/dashboard/agent/MessageCard.tsx";
const approvalPanelPath = "src/components/dashboard/agent/AgentApprovalPanel.tsx";
const composerPath = "src/components/dashboard/agent/AgentComposer.tsx";
const workbenchPath = "src/components/dashboard/agent/AgentWorkbench.tsx";
const cssPath = "src/app/styles/sunny-agent.css";

test("AgentConversation renders PlanConfirmationCard for single plan pending actions", () => {
  const source = read(conversationPath);

  assert.match(source, /PlanConfirmationCard/);
  assert.match(source, /isPlanConfirmationAction/);
  assert.match(source, /confirmationAction/);
  assert.match(source, /onConfirmApproval/);
  assert.match(source, /onCancelApproval/);
  assert.match(source, /onEditApproval\("plan"\)/);
  assert.match(source, /AgentApprovalCard/);
  assert.match(source, /BatchConfirmationCard/);
});

test("MessageCard does not own confirmation card rendering", () => {
  const source = read(messageCardPath);

  assert.doesNotMatch(source, /PlanConfirmationCard/);
  assert.match(source, /PlanDraftCard/);
  assert.match(source, /planningDraft && !isStreaming/);
});

test("pendingAction keeps PlanDraftCard out of the main confirmation path", () => {
  const conversationSource = read(conversationPath);
  const messageCardSource = read(messageCardPath);

  assert.match(conversationSource, /hasPendingConfirmation/);
  assert.match(conversationSource, /shouldCompactAssistant/);
  assert.doesNotMatch(conversationSource, /planningDraft\.stages\.map/);
  assert.doesNotMatch(messageCardSource, /pendingAction/);
});

test("AgentApprovalPanel summarizes plan pending actions instead of repeating full plan body", () => {
  const source = read(approvalPanelPath);

  assert.match(source, /isPlanConfirmationAction/);
  assert.match(source, /当前操作/);
  assert.match(source, /等待确认/);
  assert.match(source, /原因：将写入数据库/);
  assert.match(source, /来源：计划草案/);
  assert.match(source, /当前操作尚未执行，确认后才会创建计划/);
  assert.doesNotMatch(source, /decomposedPlan\.phases\.map/);
  assert.doesNotMatch(source, /sunny-agent-change-list-v2[^]*isPlanConfirmationAction/);
});

test("AgentComposer has pending confirmation mode without changing ordinary input flow", () => {
  const source = read(composerPath);

  assert.match(source, /isAwaitingSingleConfirmation/);
  assert.match(source, /补充修改要求，或直接确认执行/);
  assert.match(source, /等待确认 ·/);
  assert.match(source, /确认执行/);
  assert.match(source, /返回修改/);
  assert.match(source, /取消/);
  assert.match(source, /type="button"/);
  assert.match(source, /type="submit"/);
});

test("AgentWorkbench wires Composer pending actions to existing approval handlers", () => {
  const source = read(workbenchPath);

  assert.match(source, /onConfirmApproval=\{onConfirmApproval\}/);
  assert.match(source, /onCancelApproval=\{onCancelApproval\}/);
  assert.match(source, /onEditApproval=\{onEditApproval\}/);
});

test("ordinary composer does not show pending action buttons without pendingAction", () => {
  const source = read(composerPath);

  assert.match(source, /isAwaitingSingleConfirmation \? \(/);
  assert.match(source, /: null/);
});

test("confirmation UX CSS uses tokens, constrained preview and no vertical red warning class", () => {
  const source = read(cssPath);
  const start = source.indexOf(".sunny-plan-confirmation-card");
  const end = source.indexOf("/* ── Progress Bar", start);
  const confirmationCss = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(confirmationCss, /var\(--/);
  assert.match(confirmationCss, /max-height:/);
  assert.match(confirmationCss, /overflow:\s*auto/);
  assert.doesNotMatch(confirmationCss, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(confirmationCss, /writing-mode:\s*vertical/);
});
