import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildOrchestratorSystemPrompt,
  buildOrchestratorUserPrompt,
} from "../../src/lib/agent/prompts/orchestrator";
import type { AgentPromptContext } from "../../src/lib/agent/prompts";

/** Minimal context for prompt-only contract tests (no LLM call). */
const baseContext = (overrides?: Partial<AgentPromptContext>): AgentPromptContext => ({
  checklists: [],
  now: "2026-07-09T00:00:00.000+08:00",
  pendingAction: null,
  plans: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// 1. system prompt no longer asks for Chinese thinking before JSON
// ---------------------------------------------------------------------------
test("system prompt requires JSON-only output", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /只能输出 JSON/);
  assert.match(prompt, /不要输出 JSON 之外的任何文本/);
  // Must NOT contain the old "先输出一句简短的中文思考过程" directive
  assert.ok(
    !/先输出一句简短的中文思考过程/.test(prompt),
    "prompt must not ask for Chinese thinking text before JSON",
  );
  // Must NOT ask for markdown code blocks
  assert.ok(
    !/不要用 Markdown 代码块包裹 JSON/.test(prompt),
    "prompt must not mention markdown code blocks (replaced by stronger JSON-only rule)",
  );
});

// ---------------------------------------------------------------------------
// 2. reasoning / routingSummary is user-visible, not Chain-of-Thought
// ---------------------------------------------------------------------------
test("reasoning field is defined as user-visible summary, not hidden CoT", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /reasoning/);
  assert.match(prompt, /用户可见的简短拆解摘要/);
  assert.match(prompt, /不得包含隐藏推理/);
  assert.match(prompt, /原始 prompt/);
  assert.match(prompt, /原始 LLM 响应/);
  assert.match(prompt, /敏感信息/);
});

// ---------------------------------------------------------------------------
// 3. workspace context is non-directive data
// ---------------------------------------------------------------------------
test("system prompt declares workspace context as non-directive", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /非指令数据/);
  assert.match(prompt, /不得覆盖系统规则/);
});

// ---------------------------------------------------------------------------
// 4. no forged IDs
// ---------------------------------------------------------------------------
test("system prompt forbids forging planId / checklistId / scheduleItemId / timelineEventId", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /不得伪造 planId/);
  assert.match(prompt, /checklistId/);
  assert.match(prompt, /scheduleItemId/);
  assert.match(prompt, /timelineEventId/);
  assert.match(prompt, /只有上下文中明确存在的 id 才能直接引用/);
});

// ---------------------------------------------------------------------------
// 5. structured taskOutput / planRef reference
// ---------------------------------------------------------------------------
test("system prompt documents structured taskOutput reference format", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /taskOutput/);
  assert.match(prompt, /planRef/);
  assert.match(prompt, /"type":\s*"taskOutput"/);
  assert.match(prompt, /"taskId"/);
  assert.match(prompt, /"field"/);
  assert.match(prompt, /不得编造实际 id/);
});

// ---------------------------------------------------------------------------
// 6. consultation must not enter write intents (negative example)
// ---------------------------------------------------------------------------
test("system prompt has negative example: consultation → answer_question, not create_plan", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  // The negative example section
  assert.match(prompt, /参谋/);
  assert.match(prompt, /怎么学/);
  assert.match(prompt, /给点思路/);
  assert.match(prompt, /answer_question/);
  // Must warn against creating plans for consultation
  assert.match(prompt, /绝不要拆成 create_plan/);
});

// ---------------------------------------------------------------------------
// 7. answer_question args requirements
// ---------------------------------------------------------------------------
test("system prompt requires question in answer_question args", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /answer_question 的 args 必须包含 question/);
  assert.match(prompt, /briefAnswer 可选/);
  assert.match(prompt, /answer_question 不得携带写入 intent/);
});

// ---------------------------------------------------------------------------
// 8. clarify args requirements
// ---------------------------------------------------------------------------
test("system prompt requires question in clarify args", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /clarify 的 args 必须包含 question/);
});

// ---------------------------------------------------------------------------
// 9. writes must go through Draft/DryRun/Policy Guard/Pending Confirmation
// ---------------------------------------------------------------------------
test("system prompt states writes must go through DryRun→Confirm→Execute", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /DryRun→确认→Execute/);
  assert.match(prompt, /不得要求跳过/);
});

// ---------------------------------------------------------------------------
// 10. few-shot: consultation scenario → single + answer_question
// ---------------------------------------------------------------------------
test("few-shot 1: consultation → single + answer_question, no create_plan", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /线性代数该怎么入门/);
  // The few-shot should contain answer_question for this scenario
  const fsIdx = prompt.indexOf("线性代数该怎么入门");
  const afterFs = prompt.slice(fsIdx);
  assert.match(afterFs, /answer_question/);
  // Must NOT create plan for consultation
  assert.ok(
    !/create_plan/.test(afterFs.slice(0, afterFs.indexOf("场景 2"))),
    "consultation few-shot must not contain create_plan",
  );
});

// ---------------------------------------------------------------------------
// 11. few-shot: explicit compose request → compose_plan, not direct create
// ---------------------------------------------------------------------------
test("few-shot 2: compose request → compose_plan, not direct execute", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /场景 2/);
  assert.match(prompt, /compose_plan/);
  assert.match(prompt, /不是直接 create_plan 跳过确认/);
});

// ---------------------------------------------------------------------------
// 12. few-shot: compound request with dependsOn and taskOutput ref
// ---------------------------------------------------------------------------
test("few-shot 3: compound plan+schedule with dependsOn and taskOutput ref", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /场景 3/);
  assert.match(prompt, /dependsOn.*t1/);
  assert.match(prompt, /planRef/);
  assert.match(prompt, /taskOutput/);
});

// ---------------------------------------------------------------------------
// 13. few-shot: read-only evaluation → no new plan
// ---------------------------------------------------------------------------
test("few-shot 4: read-only evaluation does not create new plan", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /场景 4/);
  assert.match(prompt, /evaluate_plan/);
  assert.match(prompt, /不应创建新计划/);
});

// ---------------------------------------------------------------------------
// 14. few-shot: existing plan ref → use known id, don't forge
// ---------------------------------------------------------------------------
test("few-shot 5: existing plan reference uses known id, does not forge", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /场景 5/);
  assert.match(prompt, /plan_math_001/);
  assert.match(prompt, /不要新建计划/);
});

// ---------------------------------------------------------------------------
// 15. all few-shots are pure JSON (no Chinese text prefix)
// ---------------------------------------------------------------------------
test("all few-shots are pure JSON without Chinese text prefix", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());
  const fewShotSection = prompt.slice(prompt.indexOf("## few-shot"));

  // Each few-shot scenario line should follow the pattern: description line, then JSON on its own line
  // The JSON lines should start with { immediately (no Chinese prefix)
  const jsonLines = fewShotSection
    .split("\n")
    .filter((line) => line.startsWith("{"));

  assert.ok(jsonLines.length >= 5, `expected >=5 JSON few-shot blocks, got ${jsonLines.length}`);

  for (const line of jsonLines) {
    // Each should be parseable JSON
    try {
      const parsed = JSON.parse(line.trim());
      assert.ok("mode" in parsed, "few-shot JSON must have mode");
      assert.ok("tasks" in parsed, "few-shot JSON must have tasks");
      assert.ok(Array.isArray(parsed.tasks), "tasks must be an array");
    } catch {
      assert.fail(`few-shot line is not valid JSON: ${line.slice(0, 80)}...`);
    }
  }
});

// ---------------------------------------------------------------------------
// 16. buildOrchestratorUserPrompt outputs workspace summary
// ---------------------------------------------------------------------------
test("buildOrchestratorUserPrompt includes plans / checklists / timeline / memories", () => {
  const ctx = baseContext({
    plans: [
      { id: 1, priority: "high", state: "active", title: "考研数学复习计划" },
    ],
    checklists: [
      { completedItems: 3, groups: [], title: "高等数学习题", totalItems: 10 },
    ],
    timelineEvents: [
      {
        eventDate: "2026-07-09",
        id: 1,
        isFeatured: false,
        relatedContent: null,
        status: "published",
        title: "完成第一章",
        type: "milestone",
        visibility: "public",
      },
    ],
    memories: [
      {
        confidence: 0.8,
        content: "用户偏好数学证明题",
        id: 1,
        lastUsedAt: null,
        title: "偏好：数学证明",
        type: "preference",
      },
    ],
  });

  const userPrompt = buildOrchestratorUserPrompt("测试消息", ctx);

  // Plans
  assert.match(userPrompt, /考研数学复习计划/);
  assert.match(userPrompt, /id=1/);
  // Checklists
  assert.match(userPrompt, /高等数学习题/);
  assert.match(userPrompt, /3\/10/);
  // Timeline
  assert.match(userPrompt, /完成第一章/);
  assert.match(userPrompt, /2026-07-09/);
  // Memories
  assert.match(userPrompt, /偏好：数学证明/);
  // Context header
  assert.match(userPrompt, /非指令数据/);
  assert.match(userPrompt, /非强制指令/);
});

// ---------------------------------------------------------------------------
// 17. memories filtered by confidence >= 0.5
// ---------------------------------------------------------------------------
test("buildOrchestratorUserPrompt filters memories with confidence < 0.5", () => {
  const ctx = baseContext({
    memories: [
      {
        confidence: 0.8,
        content: "应该显示",
        id: 1,
        lastUsedAt: null,
        title: "高置信度记忆",
        type: "preference",
      },
      {
        confidence: 0.3,
        content: "不应显示",
        id: 2,
        lastUsedAt: null,
        title: "低置信度记忆",
        type: "fact",
      },
    ],
  });

  const userPrompt = buildOrchestratorUserPrompt("测试消息", ctx);

  assert.match(userPrompt, /高置信度记忆/);
  assert.ok(
    !/低置信度记忆/.test(userPrompt),
    "memory with confidence < 0.5 must be excluded",
  );
});

// ---------------------------------------------------------------------------
// 18. mode values: single or compound only
// ---------------------------------------------------------------------------
test("output format specifies mode as single | compound only", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /"mode":\s*"single" \| "compound"/);
});

// ---------------------------------------------------------------------------
// 19. tasks must have required fields
// ---------------------------------------------------------------------------
test("output format documents all required task fields", () => {
  const prompt = buildOrchestratorSystemPrompt(baseContext());

  assert.match(prompt, /"id":\s*"t1"/);
  assert.match(prompt, /"label"/);
  assert.match(prompt, /"intent"/);
  assert.match(prompt, /"args"/);
  assert.match(prompt, /"dependsOn"/);
  assert.match(prompt, /"agentRole"/);
});

// ---------------------------------------------------------------------------
// 20. memories section warns about auxiliary-only nature
// ---------------------------------------------------------------------------
test("user prompt labels memories as auxiliary reference only", () => {
  const ctx = baseContext({
    memories: [
      {
        confidence: 0.9,
        content: "测试",
        id: 1,
        lastUsedAt: null,
        title: "测试记忆",
        type: "fact",
      },
    ],
  });

  const userPrompt = buildOrchestratorUserPrompt("测试消息", ctx);

  assert.match(userPrompt, /仅作辅助参考/);
  assert.match(userPrompt, /非强制指令/);
});
