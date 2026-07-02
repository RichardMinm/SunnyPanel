import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const componentPath = "src/components/dashboard/agent/ChecklistDraftCard.tsx";
const messageCardPath = "src/components/dashboard/agent/MessageCard.tsx";
const conversationPath = "src/components/dashboard/agent/AgentConversation.tsx";
const workbenchPath = "src/components/dashboard/agent/AgentWorkbench.tsx";
const constantsPath = "src/components/dashboard/agent/constants.ts";

test("ChecklistDraftCard prepare button delegates to onPrepareCreate only", () => {
  const source = read(componentPath);

  assert.match(source, /onPrepareCreate/);
  assert.match(source, /准备创建清单/);
  assert.match(source, /onClick=\{onPrepareCreate\}/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /pendingAction/);
});

test("MessageCard passes checklist prepare callback to ChecklistDraftCard", () => {
  const source = read(messageCardPath);

  assert.match(source, /onChecklistDraftPrepareCreate/);
  assert.match(source, /<ChecklistDraftCard\s+draft=\{planningChecklistDraft\}\s+onPrepareCreate=\{onChecklistDraftPrepareCreate\}/s);
});

test("AgentConversation disables checklist prepare callback while submitting", () => {
  const source = read(conversationPath);

  assert.match(source, /onChecklistDraftPrepareCreate/);
  assert.match(source, /onChecklistDraftPrepareCreate=\{isSubmitting \? undefined : onChecklistDraftPrepareCreate\}/);
});

test("AgentWorkbench sends explicit checklist creation intent from draft card", () => {
  const source = read(workbenchPath);

  assert.match(source, /onChecklistDraftPrepareCreate/);
  assert.match(source, /就按这个清单草案创建清单/);
  assert.match(source, /void onSendMessage\("就按这个清单草案创建清单"\)/);
  assert.doesNotMatch(source, /createChecklist/);
});

test("confirmation labels include create_checklist as 创建清单", () => {
  const source = read(constantsPath);

  assert.match(source, /create_checklist:\s*"创建清单"/);
});
