import assert from "node:assert/strict";
import { test } from "node:test";

import {
  revisePlanDraft,
  type PlanDraft,
} from "../../../src/lib/agent/planning/draft";

const sampleDraft: PlanDraft = {
  assumptions: ["草案未写入数据库"],
  availableTime: "每天 2 小时",
  currentProgress: "登录已完成",
  deadline: "2026-06-30",
  goal: "SunnyPanel 第一版上线",
  nextActions: ["继续调整草案", "就按这个创建"],
  risks: ["时间紧，需要控制范围"],
  scope: "登录、Agent 对话、部署",
  stages: [
    {
      description: "完成上线前闭环",
      tasks: ["修复登录页", "补齐 Agent 对话"],
      title: "上线收尾",
    },
  ],
  successCriteria: "内测可用",
  title: "SunnyPanel 第一版上线计划草案",
};

test("revisePlanDraft does not mutate the original draft", () => {
  const original = structuredClone(sampleDraft);

  const revised = revisePlanDraft({
    draft: sampleDraft,
    instruction: "加上测试",
  });

  assert.deepEqual(sampleDraft, original);
  assert.notEqual(revised, sampleDraft);
});

test("adding testing creates a single testing stage", () => {
  const revised = revisePlanDraft({
    draft: sampleDraft,
    instruction: "加上测试，测试单独一阶段",
  });

  const testingStages = revised.stages.filter((stage) => /测试|修复/u.test(stage.title));

  assert.equal(testingStages.length, 1);
  assert.deepEqual(testingStages[0]?.tasks, [
    "回归核心流程",
    "修复阻塞问题",
    "验证上线前检查项",
  ]);
});

test("adding testing twice does not duplicate testing stage", () => {
  const once = revisePlanDraft({
    draft: sampleDraft,
    instruction: "加上测试",
  });
  const twice = revisePlanDraft({
    draft: once,
    instruction: "增加测试阶段",
  });

  assert.equal(twice.stages.filter((stage) => /测试|修复/u.test(stage.title)).length, 1);
});

test("adding deployment creates a single deployment stage", () => {
  const revised = revisePlanDraft({
    draft: sampleDraft,
    instruction: "部署单独成一阶段",
  });

  const deploymentStages = revised.stages.filter((stage) => stage.title === "部署与上线");

  assert.equal(deploymentStages.length, 1);
  assert.deepEqual(deploymentStages[0]?.tasks, [
    "准备生产环境配置",
    "执行部署",
    "验证线上核心路径",
  ]);
});

test("adding deployment twice does not duplicate deployment stage", () => {
  const once = revisePlanDraft({
    draft: sampleDraft,
    instruction: "加上部署",
  });
  const twice = revisePlanDraft({
    draft: once,
    instruction: "增加上线阶段",
  });

  assert.equal(twice.stages.filter((stage) => stage.title === "部署与上线").length, 1);
});

test("public deployment standard updates successCriteria", () => {
  const revised = revisePlanDraft({
    draft: sampleDraft,
    instruction: "上线标准是公开部署可用",
  });

  assert.equal(revised.successCriteria, "公开部署可用");
});

test("deleting testing stage removes the matched stage", () => {
  const withTesting = revisePlanDraft({
    draft: sampleDraft,
    instruction: "加上测试",
  });
  const revised = revisePlanDraft({
    draft: withTesting,
    instruction: "删除测试阶段",
  });

  assert.equal(revised.stages.some((stage) => /测试|修复/u.test(stage.title)), false);
});

test("unknown instruction preserves draft and records follow-up context", () => {
  const revised = revisePlanDraft({
    draft: sampleDraft,
    instruction: "让它更像我脑子里的那个版本",
  });

  assert.equal(revised.title, sampleDraft.title);
  assert.equal(revised.goal, sampleDraft.goal);
  assert.equal(revised.deadline, sampleDraft.deadline);
  assert.deepEqual(revised.stages, sampleDraft.stages);
  assert.ok(
    revised.assumptions?.some((item) => /让它更像我脑子里的那个版本/u.test(item)) ||
      revised.nextActions?.some((item) => /让它更像我脑子里的那个版本/u.test(item)),
  );
});

test("time strategy instruction is recorded without unsafe date reshuffling", () => {
  const revised = revisePlanDraft({
    draft: sampleDraft,
    instruction: "时间压缩，优先核心功能，改成更保守",
  });

  assert.deepEqual(revised.stages.map((stage) => stage.title), sampleDraft.stages.map((stage) => stage.title));
  assert.ok(revised.assumptions?.some((item) => /更保守|优先保证核心功能/u.test(item)));
  assert.ok(revised.risks?.some((item) => /时间策略/u.test(item)));
});
