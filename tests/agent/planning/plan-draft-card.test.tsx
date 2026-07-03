import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import type { AgentChatMessage, PendingAction } from "../../../src/lib/agent/schemas";
import type { PlanDraft } from "../../../src/lib/agent/planning/draft";
import {
  attachPlanningDraftToLastAssistantMessage,
  extractPlanningDraftFromSessionState,
} from "../../../src/lib/agent/planning/draft-message";

const read = (path: string) => readFileSync(path, "utf8");

const componentPath = "src/components/dashboard/agent/PlanDraftCard.tsx";
const messageCardPath = "src/components/dashboard/agent/MessageCard.tsx";
const conversationPath = "src/components/dashboard/agent/AgentConversation.tsx";
const agentCssPath = "src/app/styles/sunny-agent.css";

const sampleDraft: PlanDraft = {
  assumptions: ["范围按第一版内测可用处理"],
  availableTime: "每天 2 小时",
  currentProgress: "登录页已完成",
  deadline: "6月30日",
  goal: "SunnyPanel 第一版上线",
  risks: ["时间紧，需要控制范围"],
  scope: "登录、Agent 对话、部署",
  stages: [
    {
      description: "完成上线前的关键闭环",
      endDate: "6月30日",
      startDate: "6月29日",
      tasks: ["修复登录页", "补齐 Agent 对话", "完成部署检查"],
      title: "上线收尾",
    },
  ],
  successCriteria: "内测可用",
  title: "SunnyPanel 第一版上线计划草案",
};

test("PlanDraftCard component exists and uses shared primitives", () => {
  assert.equal(existsSync(componentPath), true);
  const source = read(componentPath);

  assert.match(source, /import\s+\{\s*AppCard\s*\}/);
  assert.match(source, /import\s+\{\s*AppBadge\s*\}/);
  assert.match(source, /import\s+\{\s*AppButton\s*\}/);
  assert.match(source, /import\s+\{\s*AppPanel\s*\}/);
  assert.doesNotMatch(source, /className="[^"]*\bcard\b[^"]*"/i);
});

test("PlanDraftCard renders draft identity and persistence note", () => {
  const source = read(componentPath);

  assert.match(source, /draft\.title/);
  assert.match(source, /计划草案/);
  assert.match(source, /尚未写入数据库/);
  assert.doesNotMatch(source, /确认执行/);
});

test("PlanDraftCard renders all plan meta fields", () => {
  const source = read(componentPath);

  for (const label of ["目标", "截止时间", "范围", "当前进度", "可投入时间", "验收标准"]) {
    assert.match(source, new RegExp(label));
  }
  for (const key of ["goal", "deadline", "scope", "currentProgress", "availableTime", "successCriteria"]) {
    assert.match(source, new RegExp(`key: "${key}"`));
  }
  assert.match(source, /draft\[item\.key\]/);
});

test("PlanDraftCard renders stages and every stage task", () => {
  const source = read(componentPath);

  assert.match(source, /stages\.map/);
  assert.match(source, /stage\.tasks\.map/);
  assert.match(source, /stage\.title/);
  assert.match(source, /stage\.description/);
  assert.match(source, /stage\.startDate/);
  assert.match(source, /stage\.endDate/);
});

test("PlanDraftCard renders assumptions and risks as draft context", () => {
  const source = read(componentPath);

  assert.match(source, /基于以下假设/);
  assert.match(source, /风险/);
  assert.match(source, /draft\.assumptions/);
  assert.match(source, /draft\.risks/);
});

test("PlanDraftCard renders non-executing action buttons with type button", () => {
  const source = read(componentPath);

  for (const label of ["继续修改", "拆成清单", "准备创建计划"]) {
    assert.match(source, new RegExp(label));
  }

  const buttonCount = (source.match(/<AppButton/g) ?? []).length;
  const typeButtonCount = (source.match(/type="button"/g) ?? []).length;

  assert.ok(buttonCount >= 3);
  assert.ok(typeButtonCount >= 3);
});

test("PlanDraftCard does not reuse pending confirmation risk styling", () => {
  const source = read(componentPath);

  for (const forbidden of [
    "sunny-agent-approval-banner",
    "sunny-agent-confirmation-grid",
    "riskLevelLabelMap",
    "AgentApprovalCard",
    "高风险",
    "中风险",
  ]) {
    assert.doesNotMatch(source, new RegExp(forbidden));
  }
});

test("MessageCard owns only the narrow PlanDraftCard render decision", () => {
  const source = read(messageCardPath);

  assert.match(source, /PlanDraftCard/);
  assert.match(source, /planningDraft/);
  assert.match(source, /role === "assistant"/);
  assert.doesNotMatch(source, /planningDraft\.stages\.map/);
  assert.doesNotMatch(source, /planningDraft\.risks\.map/);
});

test("AgentConversation passes planningDraft to MessageCard without replacing confirmation cards", () => {
  const source = read(conversationPath);

  assert.match(source, /planningDraft=\{message\.planningDraft/);
  assert.match(source, /hasPendingConfirmation/);
  assert.match(source, /AgentApprovalCard/);
  assert.match(source, /BatchConfirmationCard/);
});

test("ordinary assistant messages do not receive a PlanDraftCard marker", () => {
  const messages: AgentChatMessage[] = [
    { content: "普通回答", role: "assistant" },
  ];

  const attached = attachPlanningDraftToLastAssistantMessage(messages, null, null);

  assert.equal(attached[0].planningDraft, undefined);
});

test("session planning draft can be projected onto the latest assistant message", () => {
  const messages: AgentChatMessage[] = [
    { content: "请做计划", role: "user" },
    { content: "这是计划草案", role: "assistant" },
  ];
  const sessionState = {
    planning: {
      draft: sampleDraft,
    },
  };

  const draft = extractPlanningDraftFromSessionState(sessionState);
  const attached = attachPlanningDraftToLastAssistantMessage(messages, draft, null);

  assert.equal(attached[1].planningDraft?.title, sampleDraft.title);
  assert.equal(attached[0].planningDraft, undefined);
  assert.equal(messages[1].planningDraft, undefined);
});

test("pendingAction keeps confirmation flow separate from PlanDraftCard projection", () => {
  const pendingAction: PendingAction = {
    action: {
      args: { sourceText: "创建计划" },
      changes: [],
      id: "action-draft-card-test",
      intent: "compose_plan",
      requiresConfirmation: true,
      riskLevel: "medium",
      summary: "创建计划",
    },
    type: "await_confirmation",
  };
  const messages: AgentChatMessage[] = [
    { content: "这是计划草案", role: "assistant" },
  ];

  const attached = attachPlanningDraftToLastAssistantMessage(messages, sampleDraft, pendingAction);

  assert.equal(attached[0].planningDraft, undefined);
});

test("PlanDraftCard CSS uses tokens and no hardcoded hex colors", () => {
  const source = read(agentCssPath);
  const start = source.indexOf(".sunny-plan-draft-card");
  const end = source.indexOf("/* ── Progress Bar", start);
  const draftCss = source.slice(start, end);

  assert.match(draftCss, /var\(--/);
  assert.doesNotMatch(draftCss, /#[0-9a-fA-F]{3,8}\b/);
});
