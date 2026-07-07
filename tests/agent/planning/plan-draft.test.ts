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
  generatePlanDraft,
  PlanDraftGenerationError,
} from "../../../src/lib/agent/planning/draft";
import { normalizeSessionState } from "../../../src/lib/agent/session/normalize-session";

const completeSlots = {
  availableTime: "每天 2 小时",
  constraints: ["必须包含测试和部署"],
  currentProgress: "登录已完成，Agent 对话还差联调",
  deadline: "6月30日",
  goal: "SunnyPanel 第一版上线",
  scope: "登录、Agent 对话和部署",
  successCriteria: "内测可用",
};

test("generatePlanDraft derives a title from slots", () => {
  const draft = generatePlanDraft({ slots: completeSlots });

  assert.equal(draft.title, "SunnyPanel 第一版上线计划草案");
});

test("generatePlanDraft carries goal and deadline into the draft", () => {
  const draft = generatePlanDraft({ slots: completeSlots });

  assert.equal(draft.goal, "SunnyPanel 第一版上线");
  assert.equal(draft.deadline, "6月30日");
  assert.equal(draft.scope, "登录、Agent 对话和部署");
});

test("generatePlanDraft creates stages with tasks", () => {
  const draft = generatePlanDraft({ slots: completeSlots });

  assert.ok(draft.stages.length >= 3);
  assert.ok(draft.stages.every((stage) => stage.title.trim().length > 0));
  assert.ok(draft.stages.every((stage) => stage.tasks.length > 0));
  assert.ok(draft.stages.some((stage) => stage.tasks.some((task) => /登录|Agent|部署|测试/.test(task))));
});

test("generatePlanDraft includes risks, assumptions, and success criteria", () => {
  const draft = generatePlanDraft({ slots: completeSlots });

  assert.ok((draft.risks?.length ?? 0) > 0);
  assert.ok((draft.assumptions?.length ?? 0) > 0);
  assert.equal(draft.successCriteria, "内测可用");
  assert.ok(draft.assumptions?.some((item) => /规则草案|未写入数据库|推断/.test(item)));
});

test("generatePlanDraft rejects insufficient slots", () => {
  assert.throws(
    () => generatePlanDraft({ slots: { goal: "SunnyPanel 第一版上线" } }),
    (error) => error instanceof PlanDraftGenerationError && error.code === "insufficient_slots",
  );
});

test("normalizeSessionState preserves a sanitized planning draft", () => {
  const raw = {
    schemaVersion: 1,
    updatedAt: "2026-06-29T00:00:00.000+08:00",
    semantic: {
      domain: "planning",
      stage: "drafting",
      currentTarget: { entityType: "plan", topic: "SunnyPanel 第一版上线" },
      workflow: "plan_creation",
    },
    conversation: {},
    pending: {},
    planning: {
      draft: {
        assumptions: ["规则草案", "", "规则草案"],
        deadline: "6月30日",
        goal: "SunnyPanel 第一版上线",
        invalidField: "drop me",
        nextActions: ["调整阶段", "就按这个创建"],
        risks: ["时间紧"],
        stages: [
          {
            description: "收尾",
            tasks: ["补测试", "", "部署"],
            title: "上线收尾",
          },
          {
            tasks: [],
            title: "",
          },
        ],
        successCriteria: "内测可用",
        title: "SunnyPanel 第一版上线计划草案",
      },
      workflow: "plan_creation",
    },
  };

  const session = normalizeSessionState(raw);

  assert.equal(session.planning?.draft?.title, "SunnyPanel 第一版上线计划草案");
  assert.equal(session.planning?.draft?.goal, "SunnyPanel 第一版上线");
  assert.equal(session.planning?.draft?.stages.length, 1);
  assert.deepStrictEqual(session.planning?.draft?.stages[0]?.tasks, ["补测试", "部署"]);
  assert.deepStrictEqual(session.planning?.draft?.assumptions, ["规则草案"]);
});
