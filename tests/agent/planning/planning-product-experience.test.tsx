import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ChecklistDraft } from "../../../src/lib/agent/planning/checklist-draft";
import type { PlanDraft } from "../../../src/lib/agent/planning/draft";
import type { ProposedAgentAction } from "../../../src/lib/agent/schemas";

const read = (path: string) => readFileSync(path, "utf8");

const planDraftCardPath = "src/components/dashboard/agent/PlanDraftCard.tsx";
const checklistDraftCardPath = "src/components/dashboard/agent/ChecklistDraftCard.tsx";
const planConfirmationCardPath = "src/components/dashboard/agent/PlanConfirmationCard.tsx";
const approvalCardPath = "src/components/dashboard/agent/AgentApprovalCard.tsx";
const conversationPath = "src/components/dashboard/agent/AgentConversation.tsx";
const messageCardPath = "src/components/dashboard/agent/MessageCard.tsx";

const loadMessageCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/MessageCard")).MessageCard;
};

const loadAgentApprovalCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/AgentApprovalCard")).AgentApprovalCard;
};

const samplePlanDraft: PlanDraft = {
  assumptions: ["按内测上线处理"],
  availableTime: "每天 2 小时",
  currentProgress: "登录页已完成",
  deadline: "6月30日",
  goal: "SunnyPanel 第一版上线",
  risks: ["时间紧，需要控制范围"],
  scope: "登录、Agent 对话、部署",
  stages: [
    {
      description: "完成上线前闭环",
      endDate: "6月30日",
      startDate: "6月29日",
      tasks: ["修复登录页", "完成部署检查"],
      title: "上线收尾",
    },
  ],
  successCriteria: "内测可用",
  title: "SunnyPanel 第一版上线计划草案",
};

const sampleChecklistDraft: ChecklistDraft = {
  assumptions: ["由计划草案拆解而来，尚未写入数据库。"],
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

const checklistCreateAction: ProposedAgentAction = {
  affectedDocuments: [
    {
      collection: "checklists",
      operation: "create",
      title: "SunnyPanel 第一版上线任务清单",
      visibility: "private",
    },
    {
      collection: "plans",
      documentId: 42,
      operation: "update",
      title: "SunnyPanel 第一版上线计划",
      visibility: "private",
    },
  ],
  args: {
    groups: [
      {
        items: [
          {
            description: null,
            isCompleted: false,
            title: "修复登录页",
          },
        ],
        title: "上线收尾",
      },
    ],
    sourcePlanId: 42,
    title: "SunnyPanel 第一版上线任务清单",
  },
  changes: [
    {
      collection: "checklists",
      operation: "create",
      preview: "创建清单：SunnyPanel 第一版上线任务清单",
      visibility: "private",
    },
    {
      collection: "plans",
      documentId: 42,
      operation: "update",
      preview: "关联计划 #42",
      visibility: "private",
    },
  ],
  id: "checklist-confirmation-test",
  intent: "create_checklist",
  requiresConfirmation: true,
  riskLevel: "medium",
  rollbackAvailable: true,
  summary: "创建清单：SunnyPanel 第一版上线任务清单",
};

test("draft, confirmation and result card components keep distinct semantics in source", () => {
  const planDraftSource = read(planDraftCardPath);
  const checklistDraftSource = read(checklistDraftCardPath);
  const confirmationSource = read(planConfirmationCardPath);
  const approvalSource = read(approvalCardPath);

  assert.match(planDraftSource, /计划草案/);
  assert.match(planDraftSource, /尚未写入数据库/);
  assert.match(checklistDraftSource, /清单草案/);
  assert.match(checklistDraftSource, /尚未写入数据库/);
  assert.match(confirmationSource, /等待确认/);
  assert.match(confirmationSource, /确认后才会真正创建计划/);
  assert.match(approvalSource, /等待确认/);
  assert.match(approvalSource, /确认后写入/);
  assert.doesNotMatch(planDraftSource, /确认执行/);
  assert.doesNotMatch(checklistDraftSource, /确认执行/);
});

test("MessageCard renders PlanDraftCard before parsing execution results", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已创建计划「不应该显示为结果」。",
      planningDraft: samplePlanDraft,
      role: "assistant",
    }),
  );

  assert.match(markup, /计划草案/);
  assert.match(markup, /尚未写入数据库/);
  assert.doesNotMatch(markup, /计划已创建/);
});

test("MessageCard renders ChecklistDraftCard before parsing execution results", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已创建清单「不应该显示为结果」，包含 1 个分组 / 1 个条目。",
      planningChecklistDraft: sampleChecklistDraft,
      role: "assistant",
    }),
  );

  assert.match(markup, /清单草案/);
  assert.match(markup, /尚未写入数据库/);
  assert.doesNotMatch(markup, /清单已创建/);
});

test("MessageCard renders plan creation success as product result card", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已创建完整计划「SunnyPanel 第一版上线」。我已经把目标、关键步骤、验收标准、风险和 Agent Brief 写进计划详情。",
      role: "assistant",
    }),
  );

  assert.match(markup, /sunny-action-result-card/);
  assert.match(markup, /计划已创建/);
  assert.match(markup, /SunnyPanel 第一版上线/);
  assert.match(markup, /可回滚/);
});

test("MessageCard renders checklist creation success with linked plan state", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已创建清单「SunnyPanel 上线任务清单」，包含 2 个分组 / 8 个条目，并已关联到计划 #42。",
      role: "assistant",
    }),
  );

  assert.match(markup, /sunny-action-result-card/);
  assert.match(markup, /清单已创建/);
  assert.match(markup, /2 个分组/);
  assert.match(markup, /8 个条目/);
  assert.match(markup, /已关联到计划 #42/);
  assert.match(markup, /可回滚/);
});

test("MessageCard renders completed checklist item with Timeline feedback", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已把 「SunnyPanel 上线任务清单 / 上线收尾 / 修复登录页」 标记完成，对应 Timeline 节点也已同步。如果想补一句完成备注或感受，告诉我就好。",
      role: "assistant",
    }),
  );

  assert.match(markup, /sunny-action-result-card/);
  assert.match(markup, /清单项已完成/);
  assert.match(markup, /修复登录页/);
  assert.match(markup, /Timeline/);
  assert.match(markup, /已记录\/更新/);
  assert.match(markup, /可回滚/);
});

test("MessageCard leaves ordinary assistant answers as markdown content", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "可以，我先帮你确认几个关键点。",
      role: "assistant",
    }),
  );

  assert.doesNotMatch(markup, /sunny-action-result-card/);
  assert.match(markup, /可以，我先帮你确认几个关键点/);
});

test("checklist pending confirmation remains an approval card, not a result card", async () => {
  const AgentApprovalCard = await loadAgentApprovalCard();
  const markup = renderToStaticMarkup(
    createElement(AgentApprovalCard, {
      action: checklistCreateAction,
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }),
  );

  assert.match(markup, /等待确认/);
  assert.match(markup, /创建清单/);
  assert.match(markup, /确认后写入/);
  assert.match(markup, /可回滚/);
  assert.doesNotMatch(markup, /清单已创建/);
});

test("pendingAction rendering stays above MessageCard dispatch in AgentConversation", () => {
  const conversationSource = read(conversationPath);
  const messageSource = read(messageCardPath);

  assert.match(conversationSource, /hasPendingConfirmation/);
  assert.match(conversationSource, /PlanConfirmationCard/);
  assert.match(conversationSource, /AgentApprovalCard/);
  assert.match(messageSource, /ActionResultCard/);
  assert.doesNotMatch(messageSource, /AgentApprovalCard/);
  assert.doesNotMatch(messageSource, /PlanConfirmationCard/);
});
