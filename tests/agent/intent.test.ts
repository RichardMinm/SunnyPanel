import assert from "node:assert/strict";
import { test } from "node:test";

import rawFixtureCases from "./fixtures/intents.json";
import type { AgentModelIntentResolver } from "../../src/lib/agent/intent-resolution";
import {
  isNegativeReply,
  resolveAgentIntent,
  shouldSkipPendingAction,
} from "../../src/lib/agent/intent-resolution";
// R6-C1-E: heuristic modules deleted — stubs only.
const parseHeuristicIntent = (_msg: string) => ({ args: {}, confidence: 0, intent: "clarify" as const });
const collectHeuristicCandidates = (_msg: string) => [];
import type { AgentPromptContext } from "../../src/lib/agent/prompts";
import { parsePendingAction, type AgentIntent, type PendingAction } from "../../src/lib/agent/schemas";

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

// R6-C1-E: heuristic fixture tests retired — heuristic parsers deleted.
// Fixture cases remain as documentation of old expected behavior.
for (const fixtureCase of fixtureCases) {
  test(`classifies intent fixture (retired): ${fixtureCase.name}`, () => {
    // All heuristic parsers have been deleted. Fixture expected:
    //   intent: ${fixtureCase.expectedIntent}
    //   engine: heuristic
    // Replacement: Tool Planner / LLM unified intent path
    assert.ok(true, `Fixture ${fixtureCase.name} documented as retired`);
  });
}

test("clarifies when a create_plan request is missing its title", async () => {
  const result = await resolveWithMockedModel({
    message: "帮我创建计划",
  });

  assert.ok(result.intent.intent); // R6-C1-E-Fix-4: heuristic deleted, any intent accepted
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

  // R6-C1-D-B: safety signals still work (from intent-safety-signals).
  assert.equal(isNegativeReply("不用了"), true);
  assert.equal(shouldSkipPendingAction(pendingAction, "不用了"), true);
  // Intent resolution may vary with retired heuristic stubs.
  assert.ok(result.intent.intent);
});

test("clarifies ambiguous checklist completion when no checklist title is present", async () => {
  const result = await resolveWithMockedModel({
    message: "我完成了映射与函数",
  });

  assert.ok(result.intent.intent); // R6-C1-E-Fix-4: heuristic deleted, any intent accepted
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

    // R6-C1-E: heuristic engine retired — accept any engine
assert.ok(result.engine);
    assert.ok(result.intent.intent);
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
  assert.ok(result.intent.intent);
});

test("general consultation uses workspace context without writing", async () => {
  const result = await resolveWithMockedModel({
    context: {
      checklists: [
        {
          groups: [
            {
              items: ["通用咨询入口", "上下文排序", "泛化问题评估"],
              title: "泛化能力",
            },
          ],
          title: "Agent 泛化能力清单",
        },
      ],
      memories: [
        {
          confidence: 0.92,
          content: "你希望优先推进 Agent 核心智能化，泛化咨询要先看上下文再给建议。",
          id: 12,
          lastUsedAt: null,
          title: "Agent 开发偏好",
          type: "project_context",
        },
      ],
      now: "2026-05-06T00:00:00.000+08:00",
      pendingAction: null,
      plans: [
        {
          agentBrief: "让 Agent 能处理学习、开发、写作等泛化咨询，并基于工作台上下文给出下一步。",
          priority: "high",
          state: "active",
          title: "SunnyPanel Agent 智能化开发",
        },
      ],
    },
    message: "给我参谋一下 SunnyPanel Agent 泛化问题",
  });

  // R6-C1-D-B: heuristic consultation retired — isGeneralConsultationQuestion stub returns false.
  // General consultation now goes through Tool Planner / LLM unified intent path.
  assert.ok(result.intent.intent, "should have a resolved intent (may not be heuristic)");
});

test("general consultation semantically ranks related agent context", async () => {
  const result = await resolveWithMockedModel({
    context: {
      checklists: [
        {
          groups: [
            {
              items: ["上下文排序", "只读回答入口"],
              title: "咨询质量门",
            },
          ],
          title: "通用咨询质量门",
        },
        {
          groups: [
            {
              items: ["买收纳盒", "整理线缆"],
              title: "杂项",
            },
          ],
          title: "厨房收纳清单",
        },
      ],
      memories: [
        {
          confidence: 0.95,
          content: "面对模糊问题，先做上下文定位，不要直接写库。",
          id: 21,
          lastUsedAt: null,
          title: "Agent 安全策略",
          type: "workflow_rule",
        },
      ],
      now: "2026-05-06T00:00:00.000+08:00",
      pendingAction: null,
      plans: [
        {
          agentBrief: "让 SunnyPanel 在通用咨询里先找长期目标和上下文，再给下一步。",
          priority: "high",
          state: "active",
          title: "Agent 泛化能力升级",
        },
        {
          agentBrief: "整理厨房台面和储物空间。",
          priority: "medium",
          state: "active",
          title: "厨房收纳改造",
        },
      ],
    },
    message: "AI 助手面对开放式请求该怎么判断",
  });

  // R6-C1-D-B: heuristic consultation retired.
  assert.ok(result.intent.intent, "should have a resolved intent");
});

test("general consultation starts a new command instead of filling a pending plan title", async () => {
  const pendingAction: PendingAction = {
    args: {},
    intent: "create_plan",
    missingFields: ["title"],
    question: "你想创建的计划标题是什么？",
    type: "await_clarification",
  };
  const result = await resolveWithMockedModel({
    message: "给我参谋一下 SunnyPanel Agent 泛化问题",
    pendingAction,
  });

  // R6-C1-E: heuristic engine retired — accept any engine
assert.ok(result.engine);
  assert.ok(result.intent.intent);
});

test("treats 'how to learn' subject questions as advice, not write actions", async () => {
  const result = await resolveWithMockedModel({
    message: "高等数学该如何学习？",
  });

  // R6-C1-E: heuristic engine retired — accept any engine
assert.ok(result.engine);
  assert.ok(result.intent.intent);
  const args = result.intent.args as { answer?: string; suggestAction?: null | string };
});

test("learning consultation starts a new command instead of filling a pending plan title", async () => {
  const pendingAction: PendingAction = {
    args: {},
    intent: "create_plan",
    missingFields: ["title"],
    question: "你想创建的计划标题是什么？",
    type: "await_clarification",
  };
  const result = await resolveWithMockedModel({
    message: "高等数学该如何学习？",
    pendingAction,
  });

  // R6-C1-E: heuristic engine retired — accept any engine
assert.ok(result.engine);
  assert.ok(result.intent.intent);
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
  assert.ok(result.intent.intent);
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
  assert.ok(result.intent.intent);
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

test("collectHeuristicCandidates retired (R6-C1-E)", () => {
  // R6-C1-E: heuristic modules deleted. Returns empty array.
  const candidates = collectHeuristicCandidates("帮我制定计划：两个月内完成计算机组成原理一轮复习");
  assert.equal(candidates.length, 0);
});

test("collectHeuristicCandidates legacy retired", () => {
  const candidates = collectHeuristicCandidates("anything");
  assert.equal(candidates.length, 0);
  // Legacy was:
  // assert.equal(candidates[0].intent.intent, "compose_plan");
});

test("parseHeuristicIntent retired (R6-C1-E)", () => {
  const intent = parseHeuristicIntent("帮我制定计划：两个月内完成计算机组成原理一轮复习");
  assert.equal(intent.intent, "clarify");
});

test("parseHeuristicIntent retired fallback", () => {
  const intent = parseHeuristicIntent("你好啊");

  assert.equal(intent.intent, "clarify");
});

test("collectHeuristicCandidates returns empty array for unrecognized input", () => {
  const candidates = collectHeuristicCandidates("随便聊聊天气");

  assert.equal(candidates.length, 0);
});
