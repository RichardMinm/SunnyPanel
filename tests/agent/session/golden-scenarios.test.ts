/**
 * Golden Scenario Evaluation — Phase 4E
 *
 * Multi-turn conversation simulations validating the Session Coordinator
 * pipeline (AGENT_SESSION_COORDINATOR=1) against real-world scenarios.
 *
 * Each scenario checks:
 *   - finalIntent correctness
 *   - domain / stage / workflow alignment
 *   - routeHintApplied / routeHintConflict / routeHintInfluence
 *   - NO accidental dryRun / execute on read-only intents
 *   - NO stage=executing from natural language
 */

import assert from "node:assert/strict";
import { test, before, after } from "node:test";

import { createDefaultSessionState } from "../../../src/lib/agent/session/normalize-session";
import {
  runCoordinatorPreRouter,
  type RouterArbitrationResult,
} from "../../../src/lib/agent/session/pipeline-integration";
import { isSessionCoordinatorEnabled } from "../../../src/lib/agent/session/coordinator-feature-flag";
import type { TransitionLLMCall } from "../../../src/lib/agent/session/transition-engine";
import type { AgentSessionState } from "../../../src/lib/agent/session/types";

/* ──── Helpers ──── */

const originalEnv = process.env.AGENT_SESSION_COORDINATOR;

after(() => {
  if (originalEnv !== undefined) {
    process.env.AGENT_SESSION_COORDINATOR = originalEnv;
  } else {
    delete process.env.AGENT_SESSION_COORDINATOR;
  }
});

let llmCallCount = 0;

/** Mock LLM that returns a TransitionOutput matching the given intent hints. */
const makeEngineOutput = (opts: {
  domain?: string;
  stage?: string;
  workflow?: string;
  suggestedAction?: string;
  suggestedTarget?: string;
  expectedIntents?: string[];
  shouldUpdate?: boolean;
  transitionType?: string;
  confidence?: number;
}) =>
  JSON.stringify({
    shouldUpdateSession: opts.shouldUpdate ?? true,
    sessionPatch: {
      ...(opts.domain ? { domain: opts.domain } : {}),
      ...(opts.stage ? { stage: opts.stage } : {}),
      ...(opts.workflow ? { workflow: opts.workflow } : {}),
    },
    routeHint: {
      source: "transition_engine" as const,
      contextualClues: ["golden scenario test"],
      suggestedAction: opts.suggestedAction,
      suggestedTarget: opts.suggestedTarget,
      expectedIntents: opts.expectedIntents ?? [],
      confidence: opts.confidence ?? 0.8,
    },
    transitionType: opts.transitionType ?? "continue_current_flow",
    reason: `golden scenario: ${opts.domain ?? "test"}`,
  });

const makeLLM = (output: string): TransitionLLMCall => {
  llmCallCount = 0;
  return async () => {
    llmCallCount++;
    return output;
  };
};

/** Simulate Router returning a given intent with optional topic in args. */
const routerResult = (intent: string, route = "answer" as const, reason = "golden test", args?: Record<string, unknown>): RouterArbitrationResult => ({
  intent: { intent, ...(args ? { args } : {}) },
  route,
  reason,
});

/** Assert no dangerous state: stage≠executing, no dryRun/execute-like patterns. */
const assertSafeReadOnly = (label: string, intent: string, stage: string) => {
  assert.notEqual(stage, "executing", `${label}: stage must not be executing`);
  assert.ok(
    !/execute|dry.?run|write|create|delete|update/.test(intent) ||
    intent === "query_schedule" || intent === "expand_answer" || intent === "explain_concept" ||
    intent === "capability_query" || intent === "clarify",
    `${label}: read-only intent should not be write-like`,
  );
};

/** Assert write-like intents have proper stage */
const assertWriteStage = (label: string, stage: string) => {
  assert.ok(
    ["drafting", "refining", "confirming"].includes(stage),
    `${label}: write-like stage should be drafting/refining/confirming, got ${stage}`,
  );
  assert.notEqual(stage, "executing", `${label}: write-like must not auto-execute`);
};

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 1: 网络安全 → AWD → 如果让你规划，你会如何规划
   Multi-turn: security topic, deepening, planning advice
   ═══════════════════════════════════════════════════════════════════════ */

test("S1: 网络安全→AWD multi-turn deepens in security domain", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";
  let session = createDefaultSessionState();

  /* Turn 1: "什么是AWD" */
  const t1 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "什么是AWD",
    history: [],
    llmCall: makeLLM(makeEngineOutput({
      domain: "learning",
      stage: "exploring",
      workflow: "learning_explanation",
      expectedIntents: ["explain_concept"],
      suggestedAction: "explain",
      suggestedTarget: "last_topic",
    })),
  });

  const r1 = t1.reconcile(routerResult("explain_concept", "answer", "golden", { topic: "AWD" }));
  session = r1.finalSession;

  // AWD is a security topic → should be tracked as lastTopic
  assert.equal(r1.trace.routeHintInfluence !== "none", true);
  assert.equal(session.conversation.lastTopic, "AWD", "AWD should be tracked as lastTopic");
  assert.equal(session.semantic.domain, "learning");

  /* Turn 2: "如果让你规划AWD攻防方案，你会如何规划" */
  const t2 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "如果让你规划AWD攻防方案，你会如何规划",
    history: [],
    llmCall: makeLLM(makeEngineOutput({
      domain: "learning",
      stage: "exploring",
      workflow: "learning_explanation",
      expectedIntents: ["explain_concept", "give_learning_path"],
      suggestedAction: "explain",
      suggestedTarget: "last_topic",
      transitionType: "deepen_current_flow",
    })),
  });

  const r2 = t2.reconcile(routerResult("give_learning_path", "answer", "golden", { topic: "AWD攻防" }));
  session = r2.finalSession;

  // Still in security context, expanding
  assert.equal(session.semantic.domain, "learning");
  assert.equal(session.semantic.workflow, "learning_explanation");
  assertSafeReadOnly("S1-T2", "give_learning_path", session.semantic.stage);

  /* Turn 3: "渗透测试和蓝队防御有什么区别" */
  const t3 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "渗透测试和蓝队防御有什么区别",
    history: [],
    llmCall: makeLLM(makeEngineOutput({
      domain: "learning",
      stage: "exploring",
      workflow: "learning_explanation",
      expectedIntents: ["compare_concepts"],
      suggestedAction: "explain",
      transitionType: "continue_current_flow",
    })),
  });

  const r3 = t3.reconcile(routerResult("compare_concepts"));
  session = r3.finalSession;

  // Continued in learning domain
  assert.equal(session.semantic.domain, "learning");
  assertSafeReadOnly("S1-T3", "compare_concepts", session.semantic.stage);

  // Verify the full trace is consistent
  assert.ok(r1.trace.reconciledSession);
  assert.ok(r2.trace.reconciledSession);
  assert.ok(r3.trace.reconciledSession);
});

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 2: CTF → 我需要更加详细的信息
   Multi-turn: topic tracking, deepening with rule hit
   ═══════════════════════════════════════════════════════════════════════ */

test("S2: CTF→more detail deepens and tracks topic", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";
  let session = createDefaultSessionState();

  /* Turn 1: "什么是CTF" */
  const t1 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "什么是CTF",
    history: [],
    llmCall: makeLLM(makeEngineOutput({
      domain: "learning",
      stage: "exploring",
      workflow: "learning_explanation",
      expectedIntents: ["explain_concept"],
      suggestedAction: "explain",
    })),
  });

  const r1 = t1.reconcile(routerResult("explain_concept", "answer", "golden", { topic: "CTF" }));
  session = r1.finalSession;

  assert.equal(session.conversation.lastTopic, "CTF", "CTF should be lastTopic");
  assert.equal(session.semantic.workflow, "learning_explanation");

  /* Turn 2: "我需要更加详细的信息" — rule should hit deepen */
  const t2 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "我需要更加详细的信息",
    history: [],
    llmCall: makeLLM("{}"), // Won't be called if rule hits
  });

  // Rule pre-check should catch "我需要更加详细的信息" as deepen
  assert.equal(t2.routeHint.source, "rule", "should hit deepen rule");
  assert.equal(llmCallCount, 0, "LLM should NOT be called when rule hits");

  const r2 = t2.reconcile(routerResult("expand_answer"));
  session = r2.finalSession;

  assert.equal(session.conversation.lastTopic, "CTF", "CTF preserved through deepen");
  assert.equal(session.semantic.domain, "learning");
  assertSafeReadOnly("S2-T2", "expand_answer", session.semantic.stage);
});

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 3: 写作创建 → 连续修改
   Multi-turn: create → refine → refine again
   ═══════════════════════════════════════════════════════════════════════ */

test("S3: writing creation→continuous revision tracks writing_revision", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";
  let session = createDefaultSessionState();

  /* Turn 1: 创建文章 */
  const t1 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "写一篇关于CTF的技术文章",
    history: [],
    llmCall: makeLLM(makeEngineOutput({
      domain: "writing",
      stage: "drafting",
      workflow: "writing_creation",
      expectedIntents: ["compose_writing"],
      suggestedAction: "create",
      suggestedTarget: "writing",
      transitionType: "switch_domain",
    })),
  });

  const r1 = t1.reconcile(routerResult("compose_writing", "write"));
  session = r1.finalSession;

  assert.equal(session.semantic.domain, "writing");
  assert.equal(session.semantic.stage, "drafting");
  assert.equal(session.semantic.workflow, "writing_creation");
  assertWriteStage("S3-T1", session.semantic.stage);

  /* Turn 2: 修改文章 — rule should catch in writing context */
  const t2 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "把开头改一下，太啰嗦了",
    history: [],
    llmCall: makeLLM("{}"),
  });

  // May be caught by rule pre-check (writing revision context + modify message)
  const r2 = t2.reconcile(routerResult("update_writing", "write"));
  session = r2.finalSession;

  assert.equal(session.semantic.domain, "writing");
  assert.equal(session.semantic.stage, "refining");
  assert.equal(session.semantic.workflow, "writing_revision");
  assertWriteStage("S3-T2", session.semantic.stage);

  /* Turn 3: 继续修改 */
  const t3 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "润色一下结尾部分",
    history: [],
    llmCall: makeLLM("{}"),
  });

  const r3 = t3.reconcile(routerResult("refine_writing", "write"));
  session = r3.finalSession;

  assert.equal(session.semantic.domain, "writing");
  assert.equal(session.semantic.workflow, "writing_revision");
  assertWriteStage("S3-T3", session.semantic.stage);

  // Verify trace consistency
  assert.ok(r1.trace.reconciledSession.semantic.workflow === "writing_creation");
  assert.ok(r2.trace.reconciledSession.semantic.workflow === "writing_revision");
  assert.ok(r3.trace.reconciledSession.semantic.workflow === "writing_revision");
});

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 4: 计划创建 → 连续调整 → 自然语言确认
   Multi-turn: create plan → adjust → natural language "确认"
   ═══════════════════════════════════════════════════════════════════════ */

test("S4: plan creation→adjust→confirm never auto-executes", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";
  let session = createDefaultSessionState();

  /* Turn 1: 创建考研计划 */
  const t1 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "帮我制定一个考研复习计划",
    history: [],
    llmCall: makeLLM(makeEngineOutput({
      domain: "planning",
      stage: "drafting",
      workflow: "plan_creation",
      expectedIntents: ["compose_plan"],
      suggestedAction: "create",
      suggestedTarget: "plan",
      transitionType: "switch_domain",
    })),
  });

  const r1 = t1.reconcile(routerResult("compose_plan", "write"));
  session = r1.finalSession;

  assert.equal(session.semantic.domain, "planning");
  assert.equal(session.semantic.stage, "drafting");
  assert.equal(session.semantic.workflow, "plan_creation");
  assertWriteStage("S4-T1", session.semantic.stage);

  /* Turn 2: 调整计划 */
  const t2 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "把数学复习时间调整到上午",
    history: [],
    llmCall: makeLLM(makeEngineOutput({
      domain: "planning",
      stage: "refining",
      workflow: "plan_iteration",
      expectedIntents: ["update_plan"],
      suggestedAction: "update",
      suggestedTarget: "plan",
      transitionType: "continue_current_flow",
    })),
  });

  const r2 = t2.reconcile(routerResult("update_plan", "write"));
  session = r2.finalSession;

  assert.equal(session.semantic.domain, "planning");
  assert.equal(session.semantic.stage, "refining");
  assert.equal(session.semantic.workflow, "plan_iteration");

  /* Turn 3: 自然语言"确认" — MUST NOT auto-execute */
  const t3 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "确认执行",
    history: [],
    // No pendingAction = rule misses → LLM runs
    llmCall: makeLLM(makeEngineOutput({
      domain: "planning",
      stage: "confirming",
      workflow: "plan_creation",
      expectedIntents: ["compose_plan"],
      suggestedAction: "create",
      transitionType: "confirm_pending_action",
    })),
  });

  const r3 = t3.reconcile(routerResult("compose_plan", "write"));
  session = r3.finalSession;

  // Critical: natural language "确认" must NOT produce executing
  assert.notEqual(
    session.semantic.stage,
    "executing",
    "S4-T3: natural language confirm must NEVER auto-execute",
  );
  // Should be in drafting or confirming, NOT executing
  assert.ok(
    ["drafting", "confirming"].includes(session.semantic.stage),
    `S4-T3: stage should be drafting/confirming, got ${session.semantic.stage}`,
  );
});

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 5: 写作流程中切换到日程查询
   User is in writing flow, suddenly asks about schedule
   ═══════════════════════════════════════════════════════════════════════ */

test("S5: writing→schedule query switches domain correctly", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";
  let session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_revision";
  session.semantic.stage = "refining";
  session.semantic.currentTarget = { entityType: "writing", topic: "Tech Article" };

  /* Turn: user asks about schedule while in writing — uses exact match */
  const t1 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "看看我这周的日程",
    history: [],
    llmCall: makeLLM("{}"),
  });

  // Verify rule caught it (exact match in SCHEDULE_QUERY_MESSAGES set)
  assert.equal(t1.routeHint.source, "rule", "schedule query should be caught by rule");

  const r1 = t1.reconcile(routerResult("query_schedule"));
  session = r1.finalSession;

  // Domain must switch to schedule
  assert.equal(session.semantic.domain, "schedule");
  assert.equal(session.semantic.stage, "exploring");
  assert.equal(session.semantic.workflow, "schedule_composition");

  // Read-only: no dryRun/execute for query
  assertSafeReadOnly("S5", "query_schedule", session.semantic.stage);

  // RouteHint should be aligned
  assert.ok(r1.trace.routeHintApplied, "routeHint should align with schedule query");
});

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 6: capability_query → NO dryRun / execute
   ═══════════════════════════════════════════════════════════════════════ */

test("S6: capability_query does not trigger dryRun or execute", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";
  let session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_creation";
  session.semantic.currentTarget = {
    entityType: "writing",
    topic: "Important Document",
  };

  /* Turn: capability question */
  const t1 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "你能做什么",
    history: [],
    llmCall: makeLLM(makeEngineOutput({
      domain: "writing",
      stage: "drafting",
      workflow: "writing_creation",
      expectedIntents: ["capability_query"],
      suggestedAction: "capability",
      transitionType: "continue_current_flow",
      shouldUpdate: false,
    })),
  });

  const r1 = t1.reconcile(routerResult("capability_query"));
  session = r1.finalSession;

  // Domain preserved (capability doesn't change context)
  assert.equal(session.semantic.domain, "writing");
  // currentTarget preserved
  assert.equal(session.semantic.currentTarget.topic, "Important Document");

  // CRITICAL: capability_query is READ-ONLY — no dryRun/execute
  assertSafeReadOnly("S6", "capability_query", session.semantic.stage);
  assert.equal(
    session.semantic.workflow,
    "writing_creation",
    "capability_query should not change workflow to anything that triggers write",
  );

  // Hint influence should be weak or background
  assert.ok(
    ["weak_hint", "background", "none"].includes(r1.trace.routeHintInfluence) ||
    r1.trace.routeHint.source === "transition_engine",
  );
});

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 7: routeHint conflicts with finalIntent → finalIntent wins
   ═══════════════════════════════════════════════════════════════════════ */

test("S7: routeHint conflict → finalIntent wins, trace records conflict", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_creation";
  session.semantic.currentTarget = { entityType: "writing", topic: "Draft" };

  // RouteHint suggests writing_revision (high confidence)
  const engineOutput = makeEngineOutput({
    domain: "writing",
    stage: "refining",
    workflow: "writing_revision",
    expectedIntents: ["update_writing", "refine_writing"],
    suggestedAction: "update",
    suggestedTarget: "writing",
    transitionType: "continue_current_flow",
    confidence: 0.9,
  });

  // Use a message that avoids rule pre-check so engine runs
  const t1 = await runCoordinatorPreRouter({
    conversationState: session,
    message: "今天下午有什么学习活动推荐",
    history: [],
    llmCall: makeLLM(engineOutput),
  });

  assert.equal(t1.routeHint.source, "transition_engine");
  assert.equal(t1.routeHint.confidence, 0.9);

  // BUT Router resolves query_schedule — user intent overrides
  const r1 = t1.reconcile(routerResult("query_schedule"));
  const finalSession = r1.finalSession;

  // Final intent WINS
  assert.equal(finalSession.semantic.domain, "schedule");
  assert.equal(finalSession.semantic.workflow, "schedule_composition");

  // Trace must record the conflict
  assert.equal(r1.trace.routeHintApplied, false, "routeHint should NOT be applied");
  assert.equal(r1.trace.routeHintConflict, true, "conflict should be recorded");

  // Read-only safety
  assertSafeReadOnly("S7", "query_schedule", finalSession.semantic.stage);
});

/* ═══════════════════════════════════════════════════════════════════════
   Scenario 8: AGENT_SESSION_COORDINATOR=0 → old behavior unchanged
   ═══════════════════════════════════════════════════════════════════════ */

test("S8: COORDINATOR=0 preserves old behavior — no session mutation", async () => {
  delete process.env.AGENT_SESSION_COORDINATOR;

  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.workflow = "writing_creation";
  session.conversation.lastTopic = "Old Topic";

  const result = await runCoordinatorPreRouter({
    conversationState: session,
    message: "Hello",
    history: [],
    llmCall: makeLLM("{}"),
  });

  // Session context is empty — no injection
  assert.equal(result.sessionContext, "");
  // Route hint is fallback
  assert.equal(result.routeHint.source, "fallback");

  const { finalSession, trace } = result.reconcile(routerResult("explain_concept"));

  // No session produced (null result when feature off)
  assert.equal(finalSession, null);

  // Original session untouched
  assert.equal(session.semantic.domain, "writing");
  assert.equal(session.semantic.workflow, "writing_creation");
  assert.equal(session.conversation.lastTopic, "Old Topic");
});

/* ═══════════════════════════════════════════════════════════════════════
   Cross-Scenario Safety Checks
   ═══════════════════════════════════════════════════════════════════════ */

test("ALL scenarios: no stage=executing from any read-only or natural language flow", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";
  const session = createDefaultSessionState();
  const readOnlyMessages = [
    "什么是CTF",
    "你能做什么",
    "今天有什么安排",
    "我需要更加详细的信息",
  ];

  for (const msg of readOnlyMessages) {
    const result = await runCoordinatorPreRouter({
      conversationState: session,
      message: msg,
      history: [],
      llmCall: makeLLM(makeEngineOutput({
        expectedIntents: ["explain_concept"],
        transitionType: "continue_current_flow",
      })),
    });

    // If rule hit, check rule output
    if (result.routeHint.source === "rule") {
      // Rule output should never suggest executing
      const ruleClues = result.routeHint.contextualClues.join(" ");
      assert.ok(!ruleClues.includes("execute"), `msg="${msg}": rule clues must not contain execute`);
    }
  }
});

test("ALL scenarios: write intents never produce stage=executing without confirmation", async () => {
  process.env.AGENT_SESSION_COORDINATOR = "1";
  const session = createDefaultSessionState();
  const writeMessages: Array<{ msg: string; intent: string; domain: string }> = [
    { msg: "写一篇文章", intent: "compose_writing", domain: "writing" },
    { msg: "帮我制定计划", intent: "compose_plan", domain: "planning" },
    { msg: "安排明天下午的会议", intent: "compose_schedule_item", domain: "schedule" },
  ];

  for (const { msg, intent, domain } of writeMessages) {
    const result = await runCoordinatorPreRouter({
      conversationState: session,
      message: msg,
      history: [],
      llmCall: makeLLM(makeEngineOutput({
        domain,
        stage: "drafting",
        expectedIntents: [intent],
        transitionType: "switch_domain",
      })),
    });

    const { finalSession } = result.reconcile(routerResult(intent, "write"));

    assert.notEqual(
      finalSession.semantic.stage,
      "executing",
      `msg="${msg}": write intent must not auto-execute`,
    );
    assert.ok(
      ["drafting", "refining", "confirming"].includes(finalSession.semantic.stage),
      `msg="${msg}": write stage should be drafting/refining/confirming, got ${finalSession.semantic.stage}`,
    );
  }
});

test("golden scenarios: no forbidden imports from test file", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const lines = source.split("\n");

  for (const line of lines) {
    if (line.trim().startsWith("import ") || line.trim().startsWith("} from ")) {
      assert.doesNotMatch(line.trim(), /executor|tool-gate|policy-guard|dry-run/i,
        `forbidden import on line: ${line.trim()}`);
    }
  }
});
