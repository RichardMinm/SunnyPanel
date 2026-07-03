import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import type { AgentChatMessage, PendingAction } from "../../../src/lib/agent/schemas";
import type { ChecklistDraft } from "../../../src/lib/agent/planning/checklist-draft";
import {
  attachPlanningChecklistDraftToLastAssistantMessage,
} from "../../../src/lib/agent/planning/draft-message";

const read = (path: string) => readFileSync(path, "utf8");

const componentPath = "src/components/dashboard/agent/ChecklistDraftCard.tsx";
const planDraftCardPath = "src/components/dashboard/agent/PlanDraftCard.tsx";
const messageCardPath = "src/components/dashboard/agent/MessageCard.tsx";
const conversationPath = "src/components/dashboard/agent/AgentConversation.tsx";
const workbenchPath = "src/components/dashboard/agent/AgentWorkbench.tsx";
const clientPath = "src/components/dashboard/agent-chat/use-agent-chat-messaging.ts";

const sampleChecklistDraft: ChecklistDraft = {
  assumptions: ["这是从计划草案拆出的清单草案，尚未写入数据库。"],
  goal: "SunnyPanel 第一版上线",
  groups: [
    {
      items: [
        {
          title: "修复登录页",
        },
      ],
      title: "上线收尾",
    },
  ],
  sourcePlanTitle: "SunnyPanel 第一版上线计划草案",
  title: "SunnyPanel 第一版上线任务清单草案",
};

test("ChecklistDraftCard component exists and uses shared primitives", () => {
  assert.equal(existsSync(componentPath), true);
  const source = read(componentPath);

  assert.match(source, /import\s+\{\s*AppCard\s*\}/);
  assert.match(source, /import\s+\{\s*AppBadge\s*\}/);
  assert.match(source, /import\s+\{\s*AppButton\s*\}/);
  assert.match(source, /import\s+\{\s*AppPanel\s*\}/);
});

test("ChecklistDraftCard renders title and draft-only persistence note", () => {
  const source = read(componentPath);

  assert.match(source, /draft\.title/);
  assert.match(source, /清单草案/);
  assert.match(source, /尚未写入数据库/);
  assert.doesNotMatch(source, /确认执行/);
});

test("ChecklistDraftCard renders groups and items", () => {
  const source = read(componentPath);

  assert.match(source, /draft\.groups\.map/);
  assert.match(source, /group\.items\.map/);
  assert.match(source, /group\.title/);
  assert.match(source, /item\.title/);
});

test("ChecklistDraftCard renders source plan goal and item count", () => {
  const source = read(componentPath);

  for (const label of ["来源计划", "目标", "分组数", "条目数"]) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /draft\.sourcePlanTitle/);
  assert.match(source, /draft\.goal/);
});

test("PlanDraftCard generate checklist button delegates to callback", () => {
  const source = read(planDraftCardPath);

  assert.match(source, /onGenerateChecklist/);
  assert.match(source, /拆成清单/);
  assert.match(source, /onClick=\{onGenerateChecklist\}/);
  assert.doesNotMatch(source, /fetch\(/);
  assert.doesNotMatch(source, /pendingAction/);
});

test("AgentWorkbench sends explicit checklist draft generation intent", () => {
  const source = read(workbenchPath);

  assert.match(source, /请把这个计划草案拆成清单草案/);
  assert.match(source, /void onSendMessage\("请把这个计划草案拆成清单草案"\)/);
});

test("MessageCard dispatches ChecklistDraftCard without owning checklist JSX details", () => {
  const source = read(messageCardPath);

  assert.match(source, /ChecklistDraftCard/);
  assert.match(source, /planningChecklistDraft/);
  assert.doesNotMatch(source, /planningChecklistDraft\.groups\.map/);
  assert.doesNotMatch(source, /planningChecklistDraft\.assumptions\.map/);
});

test("AgentConversation passes checklist drafts to MessageCard without replacing confirmation cards", () => {
  const source = read(conversationPath);

  assert.match(source, /planningChecklistDraft=\{message\.planningChecklistDraft/);
  assert.match(source, /hasPendingConfirmation/);
  assert.match(source, /PlanConfirmationCard/);
  assert.match(source, /AgentApprovalCard/);
});

test("client attaches planningChecklistDraft from agent response", () => {
  const source = read(clientPath);

  assert.match(source, /planningChecklistDraft/);
  assert.match(source, /attachPlanningChecklistDraftToLastAssistantMessage/);
});

test("ordinary assistant messages do not receive ChecklistDraftCard data", () => {
  const messages: AgentChatMessage[] = [
    { content: "普通回答", role: "assistant" },
  ];

  const attached = attachPlanningChecklistDraftToLastAssistantMessage(messages, null, null);

  assert.equal(attached[0].planningChecklistDraft, undefined);
});

test("pendingAction keeps confirmation flow separate from ChecklistDraftCard projection", () => {
  const pendingAction: PendingAction = {
    action: {
      args: { sourceText: "创建计划" },
      changes: [],
      id: "action-checklist-card-test",
      intent: "compose_plan",
      requiresConfirmation: true,
      riskLevel: "medium",
      summary: "创建计划",
    },
    type: "await_confirmation",
  };
  const messages: AgentChatMessage[] = [
    { content: "这是清单草案", role: "assistant" },
  ];

  const attached = attachPlanningChecklistDraftToLastAssistantMessage(
    messages,
    sampleChecklistDraft,
    pendingAction,
  );

  assert.equal(attached[0].planningChecklistDraft, undefined);
});
