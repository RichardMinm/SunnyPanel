import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { ChecklistDraft } from "../../../src/lib/agent/planning/checklist-draft";
import type { PlanDraft } from "../../../src/lib/agent/planning/draft";
import type { ProposedAgentAction } from "../../../src/lib/agent/schemas";

const conversationPath = "src/components/dashboard/agent/AgentConversation.tsx";
const messageCardPath = "src/components/dashboard/agent/MessageCard.tsx";
const planDraftCardPath = "src/components/dashboard/agent/PlanDraftCard.tsx";
const checklistDraftCardPath = "src/components/dashboard/agent/ChecklistDraftCard.tsx";

const loadAgentApprovalCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/AgentApprovalCard")).AgentApprovalCard;
};

const loadMessageCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/MessageCard")).MessageCard;
};

const loadPlanConfirmationCard = async () => {
  (globalThis as typeof globalThis & { React?: typeof React }).React = React;

  return (await import("../../../src/components/dashboard/agent/PlanConfirmationCard")).PlanConfirmationCard;
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

const planCreateAction: ProposedAgentAction = {
  args: {
    proposal: {
      agentBrief: "从计划草案进入创建确认。",
      goal: "SunnyPanel 第一版上线",
      keySteps: ["修复登录页", "完成部署检查"],
      risks: ["时间紧，需要控制范围"],
      scope: "登录、Agent 对话、部署",
      successCriteria: ["内测环境可用"],
      suggestedDueDate: "2026-06-30",
      suggestedPriority: "high",
      title: "SunnyPanel 第一版上线计划",
    },
  },
  affectedDocuments: [
    {
      collection: "plans",
      operation: "create",
      title: "SunnyPanel 第一版上线计划",
      visibility: "private",
    },
  ],
  changes: [
    {
      collection: "plans",
      operation: "create",
      preview: "创建计划：SunnyPanel 第一版上线计划",
      visibility: "private",
    },
  ],
  id: "plan-ui-state-contract",
  intent: "compose_plan",
  requiresConfirmation: true,
  riskLevel: "medium",
  rollbackAvailable: true,
  summary: "创建计划：SunnyPanel 第一版上线计划",
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
  id: "checklist-ui-state-contract",
  intent: "create_checklist",
  requiresConfirmation: true,
  riskLevel: "medium",
  rollbackAvailable: true,
  summary: "创建清单：SunnyPanel 第一版上线任务清单",
};

test("PlanDraftCard and ChecklistDraftCard render draft-only states before result parsing", async () => {
  const MessageCard = await loadMessageCard();
  const planMarkup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已创建计划「不应该显示为结果」。",
      planningDraft: samplePlanDraft,
      role: "assistant",
    }),
  );
  const checklistMarkup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已创建清单「不应该显示为结果」，包含 1 个分组 / 1 个条目。",
      planningChecklistDraft: sampleChecklistDraft,
      role: "assistant",
    }),
  );

  assert.match(planMarkup, /计划草案/);
  assert.match(planMarkup, /尚未写入数据库/);
  assert.match(planMarkup, /准备创建计划/);
  assert.doesNotMatch(planMarkup, /计划已创建/);
  assert.doesNotMatch(planMarkup, /确认执行/);

  assert.match(checklistMarkup, /清单草案/);
  assert.match(checklistMarkup, /尚未写入数据库/);
  assert.match(checklistMarkup, /准备创建清单/);
  assert.doesNotMatch(checklistMarkup, /清单已创建/);
  assert.doesNotMatch(checklistMarkup, /确认执行/);
});

test("draft cards keep non-executing source contract for prepare actions", () => {
  const planDraftSource = readFileSync(planDraftCardPath, "utf8");
  const checklistDraftSource = readFileSync(checklistDraftCardPath, "utf8");

  assert.match(planDraftSource, /onPrepareCreate/);
  assert.match(planDraftSource, /准备创建计划/);
  assert.doesNotMatch(planDraftSource, /fetch\(/);
  assert.doesNotMatch(planDraftSource, /pendingAction/);
  assert.match(checklistDraftSource, /onPrepareCreate/);
  assert.match(checklistDraftSource, /准备创建清单/);
  assert.doesNotMatch(checklistDraftSource, /fetch\(/);
  assert.doesNotMatch(checklistDraftSource, /pendingAction/);
});

test("plan confirmation renders waiting state and confirms before writing", async () => {
  const PlanConfirmationCard = await loadPlanConfirmationCard();
  const markup = renderToStaticMarkup(
    createElement(PlanConfirmationCard, {
      action: planCreateAction,
      disabled: false,
      onCancel: () => undefined,
      onConfirm: () => undefined,
      onReturnToEdit: () => undefined,
    }),
  );

  assert.match(markup, /等待确认/);
  assert.match(markup, /创建计划/);
  assert.match(markup, /确认后将创建这项计划/);
  assert.match(markup, /确认后才会真正创建计划/);
  assert.doesNotMatch(markup, /计划草案，尚未写入数据库/);
  assert.doesNotMatch(markup, /计划已创建/);
});

test("checklist confirmation stays pending and does not render result wording", async () => {
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
  assert.doesNotMatch(markup, /清单草案/);
});

test("executed plan and checklist messages render ActionResultCard result states", async () => {
  const MessageCard = await loadMessageCard();
  const planMarkup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已创建完整计划「SunnyPanel 第一版上线」。我已经把目标、关键步骤、验收标准、风险和 Agent Brief 写进计划详情。",
      role: "assistant",
    }),
  );
  const checklistMarkup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "已创建清单「SunnyPanel 上线任务清单」，包含 2 个分组 / 8 个条目，并已关联到计划 #42。",
      role: "assistant",
    }),
  );

  assert.match(planMarkup, /sunny-action-result-card/);
  assert.match(planMarkup, /计划已创建/);
  assert.match(planMarkup, /SunnyPanel 第一版上线/);
  assert.match(planMarkup, /可回滚/);
  assert.doesNotMatch(planMarkup, /计划草案/);
  assert.doesNotMatch(planMarkup, /等待确认/);

  assert.match(checklistMarkup, /sunny-action-result-card/);
  assert.match(checklistMarkup, /清单已创建/);
  assert.match(checklistMarkup, /2 个分组/);
  assert.match(checklistMarkup, /8 个条目/);
  assert.match(checklistMarkup, /已关联到计划 #42/);
  assert.match(checklistMarkup, /可回滚/);
  assert.doesNotMatch(checklistMarkup, /清单草案/);
  assert.doesNotMatch(checklistMarkup, /等待确认/);
});

test("completed checklist item result keeps Timeline feedback in result state", async () => {
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
  assert.doesNotMatch(markup, /清单草案/);
});

test("ordinary messages and pendingAction rendering stay outside MessageCard result dispatch", async () => {
  const MessageCard = await loadMessageCard();
  const markup = renderToStaticMarkup(
    createElement(MessageCard, {
      content: "可以，我先帮你确认几个关键点。",
      role: "assistant",
    }),
  );
  const conversationSource = readFileSync(conversationPath, "utf8");
  const messageSource = readFileSync(messageCardPath, "utf8");

  assert.doesNotMatch(markup, /sunny-action-result-card/);
  assert.match(markup, /可以，我先帮你确认几个关键点/);
  assert.match(conversationSource, /hasPendingConfirmation/);
  assert.match(conversationSource, /PlanConfirmationCard/);
  assert.match(conversationSource, /AgentApprovalCard/);
  assert.match(messageSource, /ActionResultCard/);
  assert.doesNotMatch(messageSource, /AgentApprovalCard/);
  assert.doesNotMatch(messageSource, /PlanConfirmationCard/);
});
