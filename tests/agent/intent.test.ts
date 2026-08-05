import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentModelIntentResolver } from "../../src/lib/agent/intent-resolution";
import {
  isNegativeReply,
  resolveAgentIntent,
  shouldSkipPendingAction,
} from "../../src/lib/agent/intent-resolution";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import { parsePendingAction, type AgentIntent, type PendingAction } from "../../src/lib/agent/schemas";

const missingModelResolver: AgentModelIntentResolver = async () => null;

const buildContext = (pendingAction: null | PendingAction = null): AgentPromptContext => ({
  checklists: [
    {
      groups: [
        {
          items: ["映射与函数", "反函数习题"],
          title: "映射与函数",
        },
      ],
      title: "高等数学",
    },
  ],
  now: "2026-05-06T00:00:00.000+08:00",
  pendingAction,
  plans: [
    {
      priority: "medium",
      state: "active",
      title: "整体计划",
    },
  ],
});

const resolveWithMockedModel = ({
  context,
  message,
  modelResolver = missingModelResolver,
  pendingAction = null,
}: {
  context?: AgentPromptContext;
  message: string;
  modelResolver?: AgentModelIntentResolver;
  pendingAction?: null | PendingAction;
}) =>
  resolveAgentIntent({
    context: context ?? buildContext(pendingAction),
    history: [],
    message,
    modelResolver,
    pendingAction,
  });

const assertExpectedArgs = (intent: AgentIntent, expectedArgs: Record<string, unknown> = {}) => {
  const actualArgs = intent.args as Record<string, unknown>;

  for (const [key, expectedValue] of Object.entries(expectedArgs)) {
    assert.deepEqual(actualArgs[key], expectedValue, `args.${key}`);
  }
};

test("continues a pending clarification with the missing field", async () => {
  const pendingAction: PendingAction = {
    args: {},
    intent: "create_plan",
    missingFields: ["title"],
    question: "你想创建的计划标题是什么？",
    type: "await_clarification",
  };
  const result = await resolveWithMockedModel({
    message: "整理个人站点发布计划",
    pendingAction,
  });

  assert.equal(result.engine, "workflow");
  assert.equal(result.intent.intent, "create_plan");
  assert.equal((result.intent.args as { title?: string }).title, "整理个人站点发布计划");
});

test("continues a pending completion-note prompt with add_completion_note", async () => {
  const pendingAction: PendingAction = {
    checklistTitle: "高等数学",
    groupTitle: "映射与函数",
    itemTitle: "反函数习题",
    type: "await_completion_note",
  };
  const result = await resolveWithMockedModel({
    message: "这次终于顺了",
    pendingAction,
  });

  assert.equal(result.engine, "workflow");
  assert.equal(result.intent.intent, "add_completion_note");
  assertExpectedArgs(result.intent, {
    checklistTitle: "高等数学",
    completionNote: "这次终于顺了",
    groupTitle: "映射与函数",
    itemTitle: "反函数习题",
  });
});

test("recognizes negative replies and skips pending non-confirmation actions", () => {
  const pendingAction: PendingAction = {
    checklistTitle: "高等数学",
    groupTitle: "映射与函数",
    itemTitle: "反函数习题",
    type: "await_completion_note",
  };
  assert.equal(isNegativeReply("不用了"), true);
  assert.equal(shouldSkipPendingAction(pendingAction, "不用了"), true);
});

test("uses the injected model resolver without calling external APIs", async () => {
  let calls = 0;
  const modelResolver: AgentModelIntentResolver = async () => {
    calls += 1;

    return {
      intent: {
        args: {
          answer: "mocked answer",
          suggestAction: null,
        },
        confidence: 0.99,
        intent: "answer_question",
      },
    };
  };
  const result = await resolveWithMockedModel({
    message: "模型接管这句",
    modelResolver,
  });

  assert.equal(calls, 1);
  assert.equal(result.engine, "model");
  assert.equal(result.intent.intent, "answer_question");
  assert.equal(
    result.intent.intent === "answer_question" ? result.intent.args.answer : null,
    "mocked answer",
  );
});

test("parsePendingAction preserves learning consultation follow-up context", () => {
  const parsed = parsePendingAction({
    originalMessage: "给我参谋一下线性代数的学习",
    requestedAction: "compose_plan",
    subject: "线性代数",
    type: "await_learning_followup",
  });
  const parsedLearning = parsed as null | { requestedAction?: string; subject?: string; type?: string };

  assert.equal(parsedLearning?.type, "await_learning_followup");
  assert.equal(parsedLearning?.subject, "线性代数");
  assert.equal(parsedLearning?.requestedAction, "compose_plan");
});

test("learning consultation follow-up asks for learning profile before composing a plan", async () => {
  const pendingAction = {
    originalMessage: "给我参谋一下线性代数的学习",
    subject: "线性代数",
    type: "await_learning_followup",
  } as unknown as PendingAction;
  const result = await resolveWithMockedModel({
    message: "那帮我拆成学习计划",
    pendingAction,
  });

  assert.equal(result.engine, "workflow");
  assert.equal(result.intent.intent, "answer_question");
  assert.match(result.intent.intent === "answer_question" ? result.intent.args.answer : "", /目标|基础|时间|期限/);
  assert.equal(
    result.intent.intent === "answer_question"
      ? (result.intent.args.learningContext as { requestedAction?: string } | null | undefined)?.requestedAction
      : null,
    "compose_plan",
  );
});

test("learning profile answer composes a plan with the previous subject and constraints", async () => {
  const pendingAction = {
    originalMessage: "给我参谋一下线性代数的学习",
    requestedAction: "compose_plan",
    subject: "线性代数",
    type: "await_learning_followup",
  } as unknown as PendingAction;
  const result = await resolveWithMockedModel({
    message: "考研数二，基础一般，每天 1 小时，两个月内完成",
    pendingAction,
  });

  assert.equal(result.engine, "workflow");
  assert.equal(result.intent.intent, "compose_plan");
  assert.match(
    result.intent.intent === "compose_plan" ? (result.intent.args.sourceText ?? "") : "",
    /线性代数/,
  );
  assert.match(
    result.intent.intent === "compose_plan" ? (result.intent.args.sourceText ?? "") : "",
    /每天 1 小时|两个月/,
  );
});

test("learning profile follow-up stores partial profile and asks only for missing constraints", async () => {
  const pendingAction = {
    originalMessage: "给我参谋一下线性代数的学习",
    requestedAction: "compose_plan",
    subject: "线性代数",
    type: "await_learning_followup",
  } as unknown as PendingAction;
  const result = await resolveWithMockedModel({
    message: "考研数二",
    pendingAction,
  });

  assert.equal(result.engine, "workflow");
  assert.equal(result.intent.intent, "answer_question");
  const args = result.intent.intent === "answer_question" ? result.intent.args : null;
  assert.match(args?.answer ?? "", /基础|时间|期限/);
  assert.doesNotMatch(args?.answer ?? "", /目标是什么/);
  assert.equal(args?.learningContext?.requestedAction, "compose_plan");
  const profile = args?.learningContext as null | undefined | { profile?: { goal?: string } };
  assert.match(profile?.profile?.goal ?? "", /考研数二/);
});

test("learning profile follow-up merges saved profile before composing a plan", async () => {
  const pendingAction = {
    originalMessage: "给我参谋一下线性代数的学习",
    profile: {
      goal: "考研数二",
    },
    requestedAction: "compose_plan",
    subject: "线性代数",
    type: "await_learning_followup",
  } as unknown as PendingAction;
  const result = await resolveWithMockedModel({
    message: "基础一般，每天 1 小时，两个月内完成",
    pendingAction,
  });

  assert.equal(result.engine, "workflow");
  assert.equal(result.intent.intent, "compose_plan");
  const sourceText = result.intent.intent === "compose_plan" ? result.intent.args.sourceText ?? "" : "";
  assert.match(sourceText, /考研数二/);
  assert.match(sourceText, /基础一般/);
  assert.match(sourceText, /每天 1 小时/);
  assert.match(sourceText, /两个月/);
});
