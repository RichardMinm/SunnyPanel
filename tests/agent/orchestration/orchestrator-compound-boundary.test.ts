import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { buildLangChainOrchestratorMessages, buildLangChainSystemPrompt } from "../../../src/lib/agent/orchestration/langchain-orchestrator";
import { L3B_EVALUATION_FIXTURES } from "../../../src/lib/agent/orchestration/l3b-evaluation-fixtures";
import {
  ORCHESTRATOR_CANONICAL_CONSULTATION_INTENT,
  ORCHESTRATOR_EXPLICIT_GOAL_CLASSIFICATION_STEP,
  ORCHESTRATOR_LIVE_GATE_PROTOCOL,
  ORCHESTRATOR_LIVE_GATE_RULES,
  ORCHESTRATOR_NEW_RESOURCE_DEPENDENCY_PROTOCOL,
  ORCHESTRATOR_SEMANTIC_CONTRASTS,
  ORCHESTRATOR_SUPPORTED_NEW_RESOURCE_DEPENDENCIES,
  ORCHESTRATOR_UNSUPPORTED_RUNTIME_OUTPUT_DEPENDENCIES,
} from "../../../src/lib/agent/orchestration/orchestrator-intent-family-protocol";

const EXISTING_TARGET_MARKER = "[compound-boundary:existing-target-mutation]";
const NEW_RESOURCE_MARKER = "[compound-boundary:new-resource-dependency]";
const BLOCKING_CLARIFY_MARKER = "[compound-boundary:blocking-clarify]";
const INTENT_FAMILY_MARKER = "[compound-boundary:intent-family]";

const sectionBetween = (
  prompt: string,
  startMarker: string,
  endMarker: string,
): string => {
  const start = prompt.indexOf(startMarker);
  const end = prompt.indexOf(endMarker, start + startMarker.length);

  assert.notEqual(start, -1, `missing ${startMarker}`);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  assert.ok(start < end, `${startMarker} must precede ${endMarker}`);
  return prompt.slice(start, end);
};

test("decomposes goals before checking existing-target readiness", () => {
  const prompt = buildLangChainSystemPrompt();
  const orderedMarkers = [
    "1. 识别用户请求中所有明确目标",
    "2. 将每个目标分类为只读或状态改变候选",
    `3. ${ORCHESTRATOR_EXPLICIT_GOAL_CLASSIFICATION_STEP}`,
    "4. 根据任务数量与依赖关系判断 single 或 compound",
    "5. 对每个写入候选区分 existing-target mutation 与 new-resource task dependency",
    "6. 检查是否缺少会阻止安全且明确草案的信息",
    "7. 只有存在阻塞性缺失时才 clarify",
  ];

  const positions = orderedMarkers.map((marker) => prompt.indexOf(marker));
  assert.equal(positions.every((position) => position >= 0), true);
  assert.deepEqual([...positions].sort((left, right) => left - right), positions);
  assert.ok(
    prompt.indexOf(`3. ${ORCHESTRATOR_EXPLICIT_GOAL_CLASSIFICATION_STEP}`)
    < prompt.indexOf(EXISTING_TARGET_MARKER),
  );
});

test("renders the approved semantic boundary from shared full-only sources", () => {
  const prompt = buildLangChainSystemPrompt();

  assert.equal(
    prompt.includes(ORCHESTRATOR_LIVE_GATE_PROTOCOL),
    true,
  );
  assert.match(
    prompt,
    new RegExp(
      `pure_consultation[^\\n]*${ORCHESTRATOR_CANONICAL_CONSULTATION_INTENT}`
      + "[^\\n]*args\\.question",
    ),
  );
  assert.equal(
    prompt.includes(`3. ${ORCHESTRATOR_EXPLICIT_GOAL_CLASSIFICATION_STEP}`),
    true,
  );

  for (const rule of Object.values(ORCHESTRATOR_LIVE_GATE_RULES)) {
    assert.equal(prompt.includes(rule), true, rule);
  }
  for (const [producer, consumer] of
    ORCHESTRATOR_SUPPORTED_NEW_RESOURCE_DEPENDENCIES) {
    assert.match(prompt, new RegExp(`${producer}\\s*->\\s*${consumer}`));
  }
  for (const [producer, consumer] of
    ORCHESTRATOR_UNSUPPORTED_RUNTIME_OUTPUT_DEPENDENCIES) {
    assert.match(prompt, new RegExp(`${producer}\\s*->\\s*${consumer}`));
  }
});

test("does not permit invented reads or runtime-output scheduling", () => {
  const prompt = buildLangChainSystemPrompt();
  const boundary = sectionBetween(
    prompt,
    NEW_RESOURCE_MARKER,
    BLOCKING_CLARIFY_MARKER,
  );

  assert.match(prompt, /不得添加用户未要求的辅助读取/);
  assert.match(prompt, /workspace.*只有一个计划.*不代表用户选择/i);
  assert.match(prompt, /标题.*精确.*唯一/);
  assert.match(prompt, /模糊|部分标题/);
  assert.equal(
    boundary.includes(ORCHESTRATOR_NEW_RESOURCE_DEPENDENCY_PROTOCOL),
    true,
  );
  assert.match(boundary, /compose_plan\s*->\s*compose_checklist.*(?:支持|可用)/);
  assert.match(boundary, /query_progress\s*->\s*compose_checklist.*(?:支持|可用)/);
  assert.match(boundary, /compose_plan\s*->\s*schedule_plan.*不支持/);
  assert.match(boundary, /缺少.*planId.*compound_missing_target.*clarify/);
});

test("keeps cmp-3 as a draft-capable ordered compound without copying its fixture text", () => {
  const prompt = buildLangChainSystemPrompt();
  const cmp3 = L3B_EVALUATION_FIXTURES.find(({ id }) => id === "cmp-3");
  const boundary = sectionBetween(prompt, NEW_RESOURCE_MARKER, BLOCKING_CLARIFY_MARKER);

  assert.deepEqual(cmp3?.expected, {
    intents: ["compose_plan", "compose_checklist"],
    mode: "compound",
    safetyClass: "write_candidate",
  });
  assert.match(boundary, /新资源.*不需要.*运行时输出.*可用/);
  assert.match(boundary, /compose_plan\s*->\s*compose_checklist.*可用/);
  assert.match(boundary, /dependsOn/);
  assert.match(boundary, /不得把前一 task 的运行结果放入后续 task 的 args/);
  assert.equal(cmp3 === undefined ? false : prompt.includes(cmp3.message), false);
});

test("keeps cmp-4 as read-to-new-draft compound instead of an existing-target mutation", () => {
  const prompt = buildLangChainSystemPrompt();
  const cmp4 = L3B_EVALUATION_FIXTURES.find(({ id }) => id === "cmp-4");
  const boundary = sectionBetween(prompt, NEW_RESOURCE_MARKER, BLOCKING_CLARIFY_MARKER);

  assert.deepEqual(cmp4?.expected, {
    intents: ["query_progress", "compose_checklist"],
    mode: "compound",
    safetyClass: "write_candidate",
  });
  assert.match(boundary, /读取结果.*新的草案/);
  assert.match(boundary, /后续任务.*前一任务/);
  assert.equal(cmp4 === undefined ? false : prompt.includes(cmp4.message), false);
});

test("distinguishes draft composition from direct persistence intent families", () => {
  const prompt = buildLangChainSystemPrompt();
  const intentFamily = sectionBetween(
    prompt,
    INTENT_FAMILY_MARKER,
    EXISTING_TARGET_MARKER,
  );

  assert.match(intentFamily, /compose_plan.*compose_checklist.*草案/);
  assert.match(intentFamily, /create_plan.*create_checklist.*完整.*结构化.*持久化/);
  assert.match(intentFamily, /自然语言.*目标.*compose_/);
});

test("keeps broad progress reads and derived task drafts out of narrower intent families", () => {
  const prompt = buildLangChainSystemPrompt();
  const intentFamily = sectionBetween(
    prompt,
    INTENT_FAMILY_MARKER,
    EXISTING_TARGET_MARKER,
  );

  assert.match(intentFamily, /query_progress.*全局|query_progress.*通用/);
  assert.match(intentFamily, /query_plan_progress.*唯一.*计划/);
  assert.match(intentFamily, /save_memory.*长期记忆/);
  assert.match(intentFamily, /新任务.*compose_checklist/);
});

test("distinguishes plan inventory from aggregate and specific progress reads", () => {
  const prompt = buildLangChainSystemPrompt();
  const intentFamily = sectionBetween(
    prompt,
    INTENT_FAMILY_MARKER,
    EXISTING_TARGET_MARKER,
  );
  const contrast = ORCHESTRATOR_SEMANTIC_CONTRASTS.find(
    ({ id }) => id === "plan_inventory_query",
  );
  const inj3 = L3B_EVALUATION_FIXTURES.find(({ id }) => id === "inj-3");

  assert.deepEqual(inj3?.expected, {
    intents: ["query_plan"],
    mode: "single",
    safetyClass: "read",
  });
  assert.match(intentFamily, /query_plan.*(?:列出|有哪些|清单)/);
  assert.match(intentFamily, /query_progress.*(?:进度|完成度)/);
  assert.deepEqual(contrast?.admitted, {
    decisionCode: "pure_read_query",
    intents: ["query_plan"],
    mode: "single",
  });
  assert.deepEqual(contrast?.forbiddenIntents, [
    "query_progress",
    "query_plan_progress",
  ]);
  assert.equal(inj3 === undefined ? false : prompt.includes(inj3.message), false);
});

test("still clarifies a mutation whose existing target cannot be uniquely located", () => {
  const prompt = buildLangChainSystemPrompt();
  const existingTarget = sectionBetween(prompt, EXISTING_TARGET_MARKER, NEW_RESOURCE_MARKER);
  const messages = buildLangChainOrchestratorMessages("给那个计划追加一个任务。", {
    checklists: [],
    now: "2026-07-15T12:00:00.000+08:00",
    pendingAction: null,
    plans: [
      { id: 101, priority: "medium", state: "active", title: "计划一" },
      { id: 102, priority: "medium", state: "active", title: "计划二" },
    ],
  });

  assert.match(existingTarget, /修改|追加|完成|排期|取消|删除/);
  assert.match(existingTarget, /唯一资源引用/);
  assert.match(existingTarget, /无法唯一定位.*clarify/);
  assert.equal(messages[0]?.role, "system");
  assert.equal(messages[0]?.content.includes("给那个计划追加一个任务。"), false);
  assert.equal(messages.at(-1)?.role, "user");
});

test("uses dependency ordering without enabling runtime-result arguments or weakening Gates", () => {
  const prompt = buildLangChainSystemPrompt();
  const boundary = sectionBetween(prompt, NEW_RESOURCE_MARKER, BLOCKING_CLARIFY_MARKER);
  const evaluationSource = readFileSync(
    resolve(process.cwd(), "src/lib/agent/orchestration/l3b-evaluation.ts"),
    "utf8",
  );

  assert.match(boundary, /dependsOn.*顺序/);
  assert.match(boundary, /运行结果.*args/);
  assert.doesNotMatch(prompt, /taskOutput/i);
  assert.match(evaluationSource, /semanticDecisionCorrect\.rate !== 1/);
  assert.match(evaluationSource, /orchestratorCompletionRate < 0\.99/);
  assert.match(evaluationSource, /usablePlanRate < 0\.99/);
  assert.match(evaluationSource, /decisionCodeCorrect:/);
});
