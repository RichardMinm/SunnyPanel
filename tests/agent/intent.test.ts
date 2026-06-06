import assert from "node:assert/strict";
import { test } from "node:test";

import rawFixtureCases from "./fixtures/intents.json";
import type { AgentModelIntentResolver } from "../../src/lib/agent/intent-resolution";
import {
  isNegativeReply,
  resolveAgentIntent,
  shouldSkipPendingAction,
} from "../../src/lib/agent/intent-resolution";
import { collectHeuristicCandidates, parseHeuristicIntent } from "../../src/lib/agent/intent/heuristics";
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

test("answers learning consultation requests without creating plans", async () => {
  const result = await resolveWithMockedModel({
    message: "给我参谋一下线性代数的学习",
  });

  assert.equal(result.engine, "heuristic");
  assert.equal(result.intent.intent, "answer_question");
  const args = result.intent.args as { answer?: string; suggestAction?: null | string };
  assert.match(args.answer ?? "", /线性代数/);
  assert.match(args.answer ?? "", /诊断|薄弱|顺序|练习/);
  assert.match(args.suggestAction ?? "", /学习计划|清单/);
});

test("learning consultation uses relevant workspace context", async () => {
  const result = await resolveWithMockedModel({
    context: {
      checklists: [
        {
          groups: [
            {
              items: ["矩阵秩错题", "特征值专项"],
              title: "矩阵与特征值",
            },
          ],
          title: "线性代数错题清单",
        },
      ],
      memories: [
        {
          confidence: 0.91,
          content: "你偏好每天晚上 1 小时复习线性代数，先做错题再回教材。",
          id: 9,
          lastUsedAt: null,
          title: "线代学习偏好",
          type: "preference",
        },
      ],
      now: "2026-05-06T00:00:00.000+08:00",
      pendingAction: null,
      plans: [
        {
          priority: "high",
          state: "active",
          title: "线性代数二轮复习",
        },
      ],
    },
    message: "给我参谋一下线性代数的学习",
  });

  assert.equal(result.engine, "heuristic");
  assert.equal(result.intent.intent, "answer_question");
  const answer = result.intent.intent === "answer_question" ? result.intent.args.answer : "";
  assert.match(answer, /线性代数二轮复习/);
  assert.match(answer, /线性代数错题清单/);
  assert.match(answer, /每天晚上 1 小时/);
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

  assert.equal(result.engine, "heuristic");
  assert.equal(result.intent.intent, "answer_question");
  const answer = result.intent.intent === "answer_question" ? result.intent.args.answer : "";
  assert.match(answer, /SunnyPanel Agent 智能化开发/);
  assert.match(answer, /Agent 泛化能力清单/);
  assert.match(answer, /先看上下文再给建议/);
  assert.match(result.intent.intent === "answer_question" ? result.intent.args.suggestAction ?? "" : "", /计划|清单|下一步/);
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

  assert.equal(result.engine, "heuristic");
  assert.equal(result.intent.intent, "answer_question");
  const answer = result.intent.intent === "answer_question" ? result.intent.args.answer : "";
  assert.match(answer, /Agent 泛化能力升级/);
  assert.match(answer, /通用咨询质量门/);
  assert.match(answer, /不要直接写库/);
  assert.doesNotMatch(answer, /厨房收纳/);
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

  assert.equal(result.engine, "heuristic");
  assert.equal(result.intent.intent, "answer_question");
});

test("treats 'how to learn' subject questions as advice, not write actions", async () => {
  const result = await resolveWithMockedModel({
    message: "高等数学该如何学习？",
  });

  assert.equal(result.engine, "heuristic");
  assert.equal(result.intent.intent, "answer_question");
  const args = result.intent.args as { answer?: string; suggestAction?: null | string };
  assert.match(args.answer ?? "", /高等数学/);
  assert.match(args.suggestAction ?? "", /计划|清单/);
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

  assert.equal(result.engine, "heuristic");
  assert.equal(result.intent.intent, "answer_question");
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

test("learning path requests are answered directly instead of treated as plan composition", async () => {
  const result = await resolveWithMockedModel({
    message: "请你为我规划一个信息安全学习的路径，偏向蓝队方向",
  });

  assert.equal(result.engine, "heuristic");
  assert.equal(result.intent.intent, "answer_question");
  const answer = result.intent.intent === "answer_question" ? result.intent.args.answer : "";
  assert.match(answer, /信息安全|蓝队/);
  assert.match(answer, /路径|阶段|路线/);
  assert.doesNotMatch(answer, /最终产出什么|开始日期/);
});

test("learning follow-up can switch from plan composition to a direct learning path", async () => {
  const pendingAction = {
    originalMessage: "请你为我规划一个信息安全学习的路径，偏向蓝队方向",
    requestedAction: "compose_plan",
    subject: "信息安全",
    type: "await_learning_followup",
  } as unknown as PendingAction;
  const result = await resolveWithMockedModel({
    message: "给出路径即可，并不是计划",
    pendingAction,
  });

  assert.equal(result.engine, "workflow");
  assert.equal(result.intent.intent, "answer_question");
  const answer = result.intent.intent === "answer_question" ? result.intent.args.answer : "";
  assert.match(answer, /信息安全|蓝队/);
  assert.match(answer, /路径|阶段|路线/);
  assert.doesNotMatch(answer, /学习目标、当前基础、每天可投入时间和期望完成期限/);
  assert.equal(result.intent.intent === "answer_question" ? result.intent.args.suggestAction : null, null);
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
