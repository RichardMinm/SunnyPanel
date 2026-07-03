import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ChecklistDraftGenerationError,
  generateChecklistDraftFromPlanDraft,
  sanitizeChecklistDraft,
} from "../../../src/lib/agent/planning/checklist-draft";
import type { PlanDraft } from "../../../src/lib/agent/planning/draft";
import { normalizeSessionState } from "../../../src/lib/agent/session/normalize-session";

const samplePlanDraft: PlanDraft = {
  assumptions: ["计划草案未写入数据库"],
  availableTime: "每天 2 小时",
  currentProgress: "登录已完成",
  deadline: "2026-06-30",
  goal: "SunnyPanel 第一版上线",
  nextActions: ["继续修改草案", "就按这个创建"],
  risks: ["时间紧，需要控制范围"],
  scope: "登录、Agent 对话、部署",
  stages: [
    {
      description: "完成上线前闭环",
      tasks: ["修复登录页", "补齐 Agent 对话"],
      title: "上线收尾",
    },
    {
      description: "上线前验证",
      tasks: ["回归核心流程", "验证部署路径"],
      title: "测试与部署",
    },
  ],
  successCriteria: "内测可用",
  title: "SunnyPanel 第一版上线计划草案",
};

test("generateChecklistDraftFromPlanDraft does not mutate the original PlanDraft", () => {
  const snapshot = structuredClone(samplePlanDraft);

  generateChecklistDraftFromPlanDraft({ planDraft: samplePlanDraft });

  assert.deepStrictEqual(samplePlanDraft, snapshot);
});

test("each PlanDraftStage becomes a ChecklistDraftGroup", () => {
  const draft = generateChecklistDraftFromPlanDraft({ planDraft: samplePlanDraft });

  assert.equal(draft.groups.length, samplePlanDraft.stages.length);
  assert.deepStrictEqual(
    draft.groups.map((group) => group.title),
    samplePlanDraft.stages.map((stage) => stage.title),
  );
});

test("stage tasks become checklist draft items", () => {
  const draft = generateChecklistDraftFromPlanDraft({ planDraft: samplePlanDraft });

  assert.deepStrictEqual(
    draft.groups[0].items.map((item) => item.title),
    samplePlanDraft.stages[0].tasks,
  );
  assert.equal(draft.groups[0].items[0].stageTitle, samplePlanDraft.stages[0].title);
});

test("draft title sourcePlanTitle and goal are preserved", () => {
  const draft = generateChecklistDraftFromPlanDraft({ planDraft: samplePlanDraft });

  assert.equal(draft.title, "SunnyPanel 第一版上线任务清单草案");
  assert.equal(draft.sourcePlanTitle, samplePlanDraft.title);
  assert.equal(draft.goal, samplePlanDraft.goal);
});

test("empty tasks get a safe fallback item", () => {
  const draft = generateChecklistDraftFromPlanDraft({
    planDraft: {
      ...samplePlanDraft,
      stages: [
        {
          tasks: [],
          title: "空阶段",
        },
      ],
    },
  });

  assert.equal(draft.groups[0].items.length, 1);
  assert.match(draft.groups[0].items[0].title, /补充空阶段的可执行任务/);
});

test("generated checklist draft includes draft assumptions", () => {
  const draft = generateChecklistDraftFromPlanDraft({ planDraft: samplePlanDraft });

  assert.ok(draft.assumptions?.some((item) => /计划草案拆出的清单草案/u.test(item)));
  assert.ok(draft.assumptions?.some((item) => /尚未写入数据库/u.test(item)));
});

test("missing PlanDraft returns a typed error", () => {
  assert.throws(
    () => generateChecklistDraftFromPlanDraft({ planDraft: null }),
    (error) => error instanceof ChecklistDraftGenerationError &&
      error.code === "missing_plan_draft",
  );
});

test("invalid PlanDraft returns a typed error", () => {
  assert.throws(
    () => generateChecklistDraftFromPlanDraft({
      planDraft: {
        ...samplePlanDraft,
        goal: "",
      },
    }),
    (error) => error instanceof ChecklistDraftGenerationError &&
      error.code === "invalid_plan_draft",
  );
});

test("sanitizeChecklistDraft filters malformed groups and limits size", () => {
  const draft = sanitizeChecklistDraft({
    title: "  清单草案  ",
    sourcePlanTitle: "SunnyPanel 第一版上线计划草案",
    goal: "SunnyPanel 第一版上线",
    groups: [
      {
        title: "阶段一",
        items: [
          { title: "任务一", priority: "high" },
          { title: "" },
        ],
      },
      {
        title: "",
        items: [{ title: "坏分组" }],
      },
    ],
    assumptions: ["尚未写入数据库", "", "尚未写入数据库"],
  });

  assert.equal(draft?.title, "清单草案");
  assert.equal(draft?.groups.length, 1);
  assert.equal(draft?.groups[0].items.length, 1);
  assert.equal(draft?.groups[0].items[0].priority, "high");
  assert.deepStrictEqual(draft?.assumptions, ["尚未写入数据库"]);
});

test("normalizeSessionState preserves sanitized planning checklist draft", () => {
  const checklistDraft = generateChecklistDraftFromPlanDraft({ planDraft: samplePlanDraft });
  const session = normalizeSessionState({
    schemaVersion: 1,
    updatedAt: "2026-06-30T00:00:00.000+08:00",
    semantic: {
      domain: "planning",
      stage: "drafting",
      currentTarget: {},
      workflow: "plan_creation",
    },
    conversation: {},
    pending: {},
    planning: {
      checklistDraft,
      workflow: "plan_creation",
    },
  });

  assert.equal(session.planning?.checklistDraft?.title, checklistDraft.title);
  assert.equal(session.planning?.checklistDraft?.groups[0].items[0].title, "修复登录页");
});
