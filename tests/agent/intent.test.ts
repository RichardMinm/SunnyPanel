import assert from "node:assert/strict";
import { test } from "node:test";

import rawFixtureCases from "./fixtures/intents.json";
import type { AgentModelIntentResolver } from "../../src/lib/agent/intent";
import {
  isNegativeReply,
  resolveAgentIntent,
  shouldSkipPendingAction,
} from "../../src/lib/agent/intent";
import { collectHeuristicCandidates, parseHeuristicIntent } from "../../src/lib/agent/intent/heuristics";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import type { AgentIntent, PendingAction } from "../../src/lib/agent/schemas";

type IntentFixture = {
  expectedArgs?: Record<string, unknown>;
  expectedIntent: AgentIntent["intent"];
  message: string;
  name: string;
};

const fixtureCases = rawFixtureCases as IntentFixture[];

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
  message,
  modelResolver = missingModelResolver,
  pendingAction = null,
}: {
  message: string;
  modelResolver?: AgentModelIntentResolver;
  pendingAction?: null | PendingAction;
}) =>
  resolveAgentIntent({
    context: buildContext(pendingAction),
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

for (const fixtureCase of fixtureCases) {
  test(`classifies intent fixture: ${fixtureCase.name}`, async () => {
    const result = await resolveWithMockedModel({
      message: fixtureCase.message,
    });

    assert.equal(result.engine, "heuristic");
    assert.equal(result.intent.intent, fixtureCase.expectedIntent);
    assertExpectedArgs(result.intent, fixtureCase.expectedArgs);
  });
}

test("clarifies when a create_plan request is missing its title", async () => {
  const result = await resolveWithMockedModel({
    message: "帮我创建计划",
  });

  assert.equal(result.intent.intent, "clarify");
  assert.deepEqual((result.intent.args as { missingFields?: string[] }).missingFields, ["title"]);
});

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

test("recognizes negative replies and skips pending non-confirmation actions", async () => {
  const pendingAction: PendingAction = {
    checklistTitle: "高等数学",
    groupTitle: "映射与函数",
    itemTitle: "反函数习题",
    type: "await_completion_note",
  };
  const result = await resolveWithMockedModel({
    message: "不用了",
    pendingAction,
  });

  assert.equal(isNegativeReply("不用了"), true);
  assert.equal(shouldSkipPendingAction(pendingAction, "不用了"), true);
  assert.notEqual(result.intent.intent, "add_completion_note");
});

test("clarifies ambiguous checklist completion when no checklist title is present", async () => {
  const result = await resolveWithMockedModel({
    message: "我完成了映射与函数",
  });

  assert.equal(result.intent.intent, "clarify");
  assert.deepEqual((result.intent.args as { missingFields?: string[] }).missingFields, [
    "checklistTitle",
    "itemTitle",
  ]);
});

test("falls back to heuristic behavior when the configured model is unavailable", async () => {
  const originalWarn = console.warn;
  console.warn = () => undefined;

  try {
    const result = await resolveWithMockedModel({
      message: "查一下整体进度",
      modelResolver: async () => {
        throw new Error("Agent model config is missing");
      },
    });

    assert.equal(result.engine, "heuristic");
    assert.equal(result.intent.intent, "query_progress");
  } finally {
    console.warn = originalWarn;
  }
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
});

test("collectHeuristicCandidates returns multiple candidates sorted by confidence", () => {
  const candidates = collectHeuristicCandidates("帮我制定计划：两个月内完成计算机组成原理一轮复习");

  assert.ok(candidates.length >= 1, "should match at least one candidate");
  assert.equal(candidates[0].intent.intent, "compose_plan");
  assert.equal(candidates[0].source, "compose_plan");

  for (let i = 1; i < candidates.length; i++) {
    assert.ok(
      (candidates[i - 1].intent.confidence ?? 0) >= (candidates[i].intent.confidence ?? 0),
      "candidates should be sorted by confidence descending",
    );
  }
});

test("parseHeuristicIntent selects the highest confidence candidate", () => {
  const intent = parseHeuristicIntent("帮我制定计划：两个月内完成计算机组成原理一轮复习");

  assert.equal(intent.intent, "compose_plan");
  assert.ok((intent.confidence ?? 0) >= 0.3);
});

test("parseHeuristicIntent falls back to clarify when no parser matches", () => {
  const intent = parseHeuristicIntent("你好啊");

  assert.equal(intent.intent, "clarify");
});

test("collectHeuristicCandidates returns empty array for unrecognized input", () => {
  const candidates = collectHeuristicCandidates("随便聊聊天气");

  assert.equal(candidates.length, 0);
});
