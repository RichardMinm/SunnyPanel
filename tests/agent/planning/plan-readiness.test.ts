/**
 * [R6-B LEGACY HEURISTIC QUARANTINE]
 *
 * This test covers the pre-LLM Tool Planner heuristic business fallback path.
 * It is NOT part of the AGENT_REQUIRE_LLM=1 protected baseline.
 * Keep temporarily for AGENT_REQUIRE_LLM=0 legacy mode compatibility.
 * Do NOT delete until: Tool Planner replacement exists AND legacy mode is retired.
 * See: docs/phase-r6b-legacy-heuristic-test-quarantine.md
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  evaluatePlanReadiness,
  mergePlanSlots,
  type PlanSlots,
} from "../../../src/lib/agent/planning/readiness";

const completeLaunchSlots: PlanSlots = {
  availableTime: "每天 4 小时",
  currentProgress: "登录、计划列表和基础部署脚本已完成",
  deadline: "2026-06-30",
  deliverables: ["登录注册", "计划看板", "部署上线"],
  goal: "SunnyPanel 第一版上线",
  scope: "第一版包含登录、计划管理、Agent 对话和部署",
  successCriteria: "内测用户可以在公网环境完成登录、创建计划和 Agent 对话",
};

test("goal and deadline only is insufficient for a large plan", () => {
  const readiness = evaluatePlanReadiness({
    slots: {
      deadline: "2026-06-30",
      goal: "SunnyPanel 第一版上线",
    },
    userMessage: "帮我计划，6月30日之前 SunnyPanel 第一版需要上线",
  });

  assert.equal(readiness.status, "insufficient");
  assert.ok(readiness.knownSlots.includes("goal"));
  assert.ok(readiness.knownSlots.includes("deadline"));
  assert.ok(readiness.missingSlots.includes("scope"));
  assert.ok(readiness.missingSlots.includes("currentProgress"));
  assert.ok(readiness.missingSlots.includes("availableTime"));
  assert.ok(readiness.missingSlots.includes("successCriteria"));
  assert.match(readiness.reason, /大型计划|目标和截止时间/);
});

test("SunnyPanel launch request with only message context is insufficient", () => {
  const readiness = evaluatePlanReadiness({
    userMessage: "帮我计划 SunnyPanel 6月30日前上线",
  });

  assert.equal(readiness.status, "insufficient");
  assert.ok(readiness.knownSlots.includes("goal"));
  assert.ok(readiness.knownSlots.includes("deadline"));
  assert.ok(readiness.missingSlots.includes("scope"));
});

test("exam plan without context is insufficient", () => {
  const readiness = evaluatePlanReadiness({
    userMessage: "帮我制定考研计划",
  });

  assert.equal(readiness.status, "insufficient");
  assert.ok(readiness.missingSlots.includes("deadline"));
  assert.ok(readiness.missingSlots.includes("currentProgress"));
});

test("large plan missing scope is insufficient", () => {
  const readiness = evaluatePlanReadiness({
    slots: {
      availableTime: "每天 3 小时",
      currentProgress: "后端接口完成了一半",
      deadline: "2026-06-30",
      goal: "SunnyPanel 第一版上线",
      successCriteria: "公网可访问并可完成核心流程",
    },
    userMessage: "帮我规划 SunnyPanel 第一版上线",
  });

  assert.equal(readiness.status, "insufficient");
  assert.ok(readiness.missingSlots.includes("scope"));
  assert.ok(readiness.missingSlots.includes("deliverables"));
});

test("large plan missing currentProgress is insufficient", () => {
  const readiness = evaluatePlanReadiness({
    slots: {
      availableTime: "每天 3 小时",
      deadline: "2026-06-30",
      goal: "SunnyPanel 第一版上线",
      scope: "登录、Agent 对话、计划管理和部署",
      successCriteria: "公网可访问并可完成核心流程",
    },
    userMessage: "保存一个 SunnyPanel 上线计划",
  });

  assert.equal(readiness.status, "insufficient");
  assert.ok(readiness.missingSlots.includes("currentProgress"));
});

test("large plan missing available time is not confirmable", () => {
  const readiness = evaluatePlanReadiness({
    explicitCreateIntent: true,
    slots: {
      currentProgress: "前端页面完成，后端还有部署和测试",
      deadline: "2026-06-30",
      goal: "SunnyPanel 第一版上线",
      scope: "登录、Agent 对话、计划管理和部署",
      successCriteria: "公网可访问并可完成核心流程",
    },
    userMessage: "请保存为计划",
  });

  assert.notEqual(readiness.status, "confirmable");
  assert.ok(["insufficient", "draftable"].includes(readiness.status));
  assert.ok(readiness.missingSlots.includes("availableTime"));
});

test("complete large plan without explicit save intent is draftable", () => {
  const readiness = evaluatePlanReadiness({
    slots: completeLaunchSlots,
    userMessage: "帮我规划 SunnyPanel 第一版上线",
  });

  assert.equal(readiness.status, "draftable");
  assert.deepEqual(readiness.missingSlots, []);
});

test("complete large plan with explicit save intent is confirmable", () => {
  const readiness = evaluatePlanReadiness({
    slots: completeLaunchSlots,
    userMessage: "请把这些内容保存为计划",
  });

  assert.equal(readiness.status, "confirmable");
});

test("existing draft can become confirmable when user says create it", () => {
  const readiness = evaluatePlanReadiness({
    hasExistingDraft: true,
    slots: completeLaunchSlots,
    userMessage: "就按这个创建",
  });

  assert.equal(readiness.status, "confirmable");
});

test("small explicit task can be confirmable", () => {
  const readiness = evaluatePlanReadiness({
    userMessage: "帮我创建一个计划：今天晚上 8 点到 10 点完成登录页修复",
  });

  assert.equal(readiness.status, "confirmable");
});

test("insufficient questions are capped at five", () => {
  const readiness = evaluatePlanReadiness({
    userMessage: "帮我制定考研计划",
  });

  assert.equal(readiness.status, "insufficient");
  assert.ok(readiness.suggestedQuestions.length > 0);
  assert.ok(readiness.suggestedQuestions.length <= 5);
});

test("insufficient questions reflect missing slots", () => {
  const readiness = evaluatePlanReadiness({
    slots: {
      deadline: "2026-06-30",
      goal: "SunnyPanel 第一版上线",
    },
    userMessage: "帮我计划，6月30日之前 SunnyPanel 第一版需要上线",
  });

  assert.ok(readiness.suggestedQuestions.some((question) => /功能|交付物|范围/.test(question)));
  assert.ok(readiness.suggestedQuestions.some((question) => /完成|进度/.test(question)));
  assert.ok(readiness.suggestedQuestions.some((question) => /投入|时间/.test(question)));
  assert.ok(readiness.suggestedQuestions.some((question) => /上线标准|标准/.test(question)));
});

test("mergePlanSlots does not mutate inputs", () => {
  const sessionSlots: PlanSlots = {
    deliverables: ["登录"],
    goal: "SunnyPanel 上线",
  };
  const extractedSlots: PlanSlots = {
    deliverables: ["部署"],
    scope: "第一版上线",
  };

  const sessionBefore = structuredClone(sessionSlots);
  const extractedBefore = structuredClone(extractedSlots);
  const merged = mergePlanSlots(sessionSlots, extractedSlots);

  assert.notEqual(merged, sessionSlots);
  assert.notEqual(merged, extractedSlots);
  assert.deepEqual(sessionSlots, sessionBefore);
  assert.deepEqual(extractedSlots, extractedBefore);
});

test("mergePlanSlots does not replace useful values with empty values", () => {
  const merged = mergePlanSlots(
    {
      availableTime: "每天 2 小时",
      goal: "SunnyPanel 上线",
    },
    {
      availableTime: "   ",
      goal: "",
    },
  );

  assert.equal(merged.availableTime, "每天 2 小时");
  assert.equal(merged.goal, "SunnyPanel 上线");
});

test("mergePlanSlots merges and deduplicates array fields", () => {
  const merged = mergePlanSlots(
    {
      constraints: ["必须部署", "需要测试"],
      deliverables: ["登录", "计划看板"],
    },
    {
      constraints: ["需要测试", "需要文档"],
      deliverables: ["计划看板", "Agent 对话"],
    },
  );

  assert.deepEqual(merged.deliverables, ["登录", "计划看板", "Agent 对话"]);
  assert.deepEqual(merged.constraints, ["必须部署", "需要测试", "需要文档"]);
});

test("evaluatePlanReadiness stays local and deterministic", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (() => {
    fetchCalled = true;
    throw new Error("network should not be used");
  }) as typeof fetch;

  try {
    const first = evaluatePlanReadiness({
      slots: completeLaunchSlots,
      userMessage: "请保存为计划",
    });
    const second = evaluatePlanReadiness({
      slots: completeLaunchSlots,
      userMessage: "请保存为计划",
    });

    assert.deepEqual(second, first);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
