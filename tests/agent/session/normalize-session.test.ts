// tests/agent/session/normalize-session.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentConversationState } from "../../../src/lib/agent/conversation/types";

// These imports will fail until normalize-session.ts exists
import { createDefaultSessionState, normalizeSessionState } from "../../../src/lib/agent/session/normalize-session";

/* ──── Acceptance Criterion 1: normalizeSessionState(null) → default ──── */

test("normalizeSessionState(null) returns default session", () => {
  const session = normalizeSessionState(null);
  assert.equal(session.schemaVersion, 1);
  assert.equal(session.semantic.domain, "general");
  assert.equal(session.semantic.stage, "exploring");
  assert.equal(session.semantic.workflow, "none");
  assert.deepStrictEqual(session.semantic.currentTarget, {});
  assert.ok(typeof session.updatedAt === "string");
  assert.ok(new Date(session.updatedAt).getTime() > 0);
  assert.deepStrictEqual(session.conversation, {});
  assert.deepStrictEqual(session.pending, {});
});

test("normalizeSessionState(undefined) returns default session", () => {
  const session = normalizeSessionState(undefined);
  assert.equal(session.schemaVersion, 1);
  assert.equal(session.semantic.domain, "general");
});

/* ──── Factory: no reference reuse ──── */

test("createDefaultSessionState() returns distinct objects each call", () => {
  const a = createDefaultSessionState();
  const b = createDefaultSessionState();
  assert.notStrictEqual(a, b);
  assert.notStrictEqual(a.semantic, b.semantic);
  assert.notStrictEqual(a.semantic.currentTarget, b.semantic.currentTarget);
  // Timestamps should differ (or be independently set)
  a.updatedAt = "2020-01-01T00:00:00.000Z";
  b.updatedAt = "2021-01-01T00:00:00.000Z";
  assert.notStrictEqual(a.updatedAt, b.updatedAt);
});

/* ──── Acceptance Criterion 2: Legacy conversationState → schemaVersion=1 ──── */

test("migrates legacy conversationState to schemaVersion=1", () => {
  const legacy: AgentConversationState = {
    lastTopic: "CTF 夺旗赛",
    lastAnswerDepth: "brief",
    lastAssistantAnswerSummary: "解释了 CTF 的定义和常见方向",
    lastMentionedEntities: ["CTF", "Web", "Pwn"],
    lastUserIntent: "explain_concept",
    updatedAt: "2026-01-15T10:30:00.000Z",
  };
  const session = normalizeSessionState(legacy);
  assert.equal(session.schemaVersion, 1);
  assert.equal(session.semantic.domain, "security"); // CTF → security keyword
  assert.equal(session.semantic.stage, "exploring");  // explain_concept → exploring
  assert.equal(session.semantic.workflow, "none");    // conservative: don't guess workflow
  assert.equal(session.semantic.currentTarget.topic, "CTF 夺旗赛");
  assert.equal(session.conversation.lastTopic, "CTF 夺旗赛");
  assert.equal(session.conversation.lastAnswerDepth, "brief");
  assert.deepStrictEqual(session.conversation.lastMentionedEntities, ["CTF", "Web", "Pwn"]);
  assert.equal(session.conversation.lastUserIntent, "explain_concept");
});

test("migrates legacy with pending confirmation", () => {
  const legacy: AgentConversationState = {
    lastTopic: "考研复习计划",
    lastAnswerDepth: "expanded",
    lastAssistantAnswerSummary: "建议制定考研复习计划",
    lastMentionedEntities: ["考研", "数学"],
    lastUserIntent: "compose_plan",
    pendingConfirmation: { actionId: "action_123" },
    updatedAt: "2026-02-20T08:00:00.000Z",
  };
  const session = normalizeSessionState(legacy);
  assert.equal(session.schemaVersion, 1);
  assert.equal(session.semantic.stage, "confirming"); // pending → confirming
  assert.ok(session.pending.confirmation);
});

test("migrates legacy without lastTopic — infers nothing, uses defaults", () => {
  const legacy: AgentConversationState = {
    lastTopic: "",
    lastAnswerDepth: "brief",
    lastAssistantAnswerSummary: "",
    lastMentionedEntities: [],
    lastUserIntent: "clarify",
    updatedAt: "2026-03-01T00:00:00.000Z",
  };
  const session = normalizeSessionState(legacy);
  assert.equal(session.schemaVersion, 1);
  assert.equal(session.semantic.domain, "general");  // empty topic → general
  assert.equal(session.semantic.workflow, "none");
});

test("migrates legacy with learning topic", () => {
  const legacy: AgentConversationState = {
    lastTopic: "如何学高数",
    lastAnswerDepth: "detailed",
    lastAssistantAnswerSummary: "建议从极限开始",
    lastMentionedEntities: ["高数", "极限"],
    lastUserIntent: "give_learning_path",
    updatedAt: "2026-04-01T00:00:00.000Z",
  };
  const session = normalizeSessionState(legacy);
  assert.equal(session.semantic.domain, "learning"); // 学/学习 → learning
});

test("migrates legacy with writing topic", () => {
  const legacy: AgentConversationState = {
    lastTopic: "润色一下我的文章开头",
    lastAnswerDepth: "brief",
    lastAssistantAnswerSummary: "已润色开头",
    lastMentionedEntities: ["文章"],
    lastUserIntent: "expand_answer",
    updatedAt: "2026-05-01T00:00:00.000Z",
  };
  const session = normalizeSessionState(legacy);
  assert.equal(session.semantic.domain, "writing"); // 文章/润色 → writing
});

test("migrates legacy with planning topic", () => {
  const legacy: AgentConversationState = {
    lastTopic: "制定一个健身计划",
    lastAnswerDepth: "brief",
    lastAssistantAnswerSummary: "建议分3个阶段",
    lastMentionedEntities: ["健身"],
    lastUserIntent: "compose_plan",
    updatedAt: "2026-05-15T00:00:00.000Z",
  };
  const session = normalizeSessionState(legacy);
  assert.equal(session.semantic.domain, "planning");
  assert.equal(session.semantic.stage, "drafting"); // compose_plan → drafting
});

test("migrates legacy with schedule topic", () => {
  const legacy: AgentConversationState = {
    lastTopic: "安排明天的日程",
    lastAnswerDepth: "brief",
    lastAssistantAnswerSummary: "已安排",
    lastMentionedEntities: [],
    lastUserIntent: "compose_schedule_item",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
  const session = normalizeSessionState(legacy);
  assert.equal(session.semantic.domain, "schedule");
  assert.equal(session.semantic.stage, "drafting");
});

/* ──── Acceptance Criterion 3: Malformed JSON → no throw ──── */

test("non-object input returns default session", () => {
  assert.doesNotThrow(() => normalizeSessionState("not an object"));
  assert.doesNotThrow(() => normalizeSessionState(42));
  assert.doesNotThrow(() => normalizeSessionState(true));
  assert.doesNotThrow(() => normalizeSessionState([]));
  const s = normalizeSessionState("garbage");
  assert.equal(s.schemaVersion, 1);
  assert.equal(s.semantic.domain, "general");
});

test("malformed object with missing fields returns sanitized defaults", () => {
  const s = normalizeSessionState({ schemaVersion: 1 });
  // sanitize should fill in missing groups with defaults
  assert.equal(s.schemaVersion, 1);
  assert.equal(s.semantic.domain, "general");
  assert.equal(s.semantic.stage, "exploring");
  assert.deepStrictEqual(s.pending, {});
});

test("v1 session with invalid enum values → sanitized to defaults", () => {
  const malformed = {
    schemaVersion: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    semantic: {
      domain: "not_a_real_domain",
      stage: "__invalid__",
      currentTarget: { entityType: "fictional_type" },
      workflow: "bogus_workflow",
    },
    conversation: { lastTopic: "test" },
    pending: {},
  };
  const s = normalizeSessionState(malformed);
  assert.equal(s.schemaVersion, 1);
  assert.equal(s.semantic.domain, "general");   // invalid → default
  assert.equal(s.semantic.stage, "exploring");   // invalid → default
  assert.equal(s.semantic.workflow, "none");     // invalid → default
  assert.equal(s.semantic.currentTarget.entityType, undefined); // invalid entityType → filtered
});

/* ──── Acceptance Criterion 4: entityId supports string | number | null ──── */

test("entityId accepts number", () => {
  const raw = {
    schemaVersion: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    semantic: {
      domain: "planning" as const,
      stage: "drafting" as const,
      currentTarget: { entityType: "plan" as const, entityName: "考研计划", entityId: 42 },
      workflow: "plan_creation" as const,
    },
    conversation: {},
    pending: {},
  };
  const s = normalizeSessionState(raw);
  assert.equal(s.semantic.currentTarget.entityId, 42);
});

test("entityId accepts string", () => {
  const raw = {
    schemaVersion: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    semantic: {
      domain: "writing" as const,
      stage: "refining" as const,
      currentTarget: { entityType: "article" as const, entityId: "abc123def456" },
      workflow: "writing_revision" as const,
    },
    conversation: {},
    pending: {},
  };
  const s = normalizeSessionState(raw);
  assert.equal(s.semantic.currentTarget.entityId, "abc123def456");
});

test("entityId null preserved", () => {
  const raw = {
    schemaVersion: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    semantic: {
      domain: "general" as const,
      stage: "exploring" as const,
      currentTarget: { entityId: null },
      workflow: "none" as const,
    },
    conversation: {},
    pending: {},
  };
  const s = normalizeSessionState(raw);
  assert.equal(s.semantic.currentTarget.entityId, null);
});

/* ──── Acceptance Criterion 5: pending fields preserved ──── */

test("pending.confirmation preserved through normalize", () => {
  const raw = {
    schemaVersion: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    semantic: { domain: "planning" as const, stage: "confirming" as const, currentTarget: {}, workflow: "plan_creation" as const },
    conversation: {},
    pending: {
      confirmation: {
        actionId: "action_001",
        summary: "创建计划「考研复习」",
        intent: "create_plan",
        riskLevel: "high" as const,
      },
    },
  };
  const s = normalizeSessionState(raw);
  assert.ok(s.pending.confirmation);
  assert.equal(s.pending.confirmation!.actionId, "action_001");
  assert.equal(s.pending.confirmation!.summary, "创建计划「考研复习」");
  assert.equal(s.pending.confirmation!.intent, "create_plan");
  assert.equal(s.pending.confirmation!.riskLevel, "high");
});

test("pending.clarification preserved through normalize", () => {
  const raw = {
    schemaVersion: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    semantic: { domain: "general" as const, stage: "exploring" as const, currentTarget: {}, workflow: "none" as const },
    conversation: {},
    pending: {
      clarification: {
        question: "你想要达到什么目标？",
        missingFields: ["goal", "baseline"],
        intent: "compose_plan",
      },
    },
  };
  const s = normalizeSessionState(raw);
  assert.ok(s.pending.clarification);
  assert.equal(s.pending.clarification!.question, "你想要达到什么目标？");
  assert.deepStrictEqual(s.pending.clarification!.missingFields, ["goal", "baseline"]);
  assert.equal(s.pending.clarification!.intent, "compose_plan");
});

test("pending.toolCall preserved through normalize", () => {
  const raw = {
    schemaVersion: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    semantic: { domain: "memory" as const, stage: "drafting" as const, currentTarget: {}, workflow: "memory_curation" as const },
    conversation: {},
    pending: {
      toolCall: {
        toolName: "search_plans",
        toolArgs: { query: "考研" },
        reason: "查找已有计划避免重复",
      },
    },
  };
  const s = normalizeSessionState(raw);
  assert.ok(s.pending.toolCall);
  assert.equal(s.pending.toolCall!.toolName, "search_plans");
  assert.deepStrictEqual(s.pending.toolCall!.toolArgs, { query: "考研" });
});

test("pending with all three slots filled", () => {
  const raw = {
    schemaVersion: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    semantic: { domain: "general" as const, stage: "exploring" as const, currentTarget: {}, workflow: "none" as const },
    conversation: {},
    pending: {
      confirmation: { actionId: "a1", summary: "test", intent: "create_plan", riskLevel: "low" as const },
      clarification: { question: "why?" },
      toolCall: { toolName: "search", toolArgs: {}, reason: "lookup" },
    },
  };
  const s = normalizeSessionState(raw);
  assert.ok(s.pending.confirmation);
  assert.ok(s.pending.clarification);
  assert.ok(s.pending.toolCall);
});

/* ──── Pending with malformed data → sanitized ──── */

test("malformed pending fields → sanitized gracefully", () => {
  const raw = {
    schemaVersion: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    semantic: { domain: "general" as const, stage: "exploring" as const, currentTarget: {}, workflow: "none" as const },
    conversation: {},
    pending: {
      confirmation: "not_an_object",
      clarification: 123,
      toolCall: null,
    },
  };
  const s = normalizeSessionState(raw);
  assert.equal(s.pending.confirmation, null);
  assert.equal(s.pending.clarification, null);
  assert.equal(s.pending.toolCall, null);
});

/* ──── String truncation ──── */

test("topic/entityName truncated to 200 characters", () => {
  const longString = "x".repeat(300);
  const raw = {
    schemaVersion: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    semantic: {
      domain: "general" as const,
      stage: "exploring" as const,
      currentTarget: { entityName: longString, topic: longString },
      workflow: "none" as const,
    },
    conversation: { lastTopic: longString },
    pending: {},
  };
  const s = normalizeSessionState(raw);
  assert.ok((s.semantic.currentTarget.topic ?? "").length <= 200);
  assert.ok((s.semantic.currentTarget.entityName ?? "").length <= 200);
  assert.ok((s.conversation.lastTopic ?? "").length <= 200);
});

/* ──── Valid v1 session passes through ──── */

test("valid v1 session passes through unchanged (sanitized)", () => {
  const valid = {
    schemaVersion: 1,
    updatedAt: "2026-06-26T12:00:00.000Z",
    semantic: {
      domain: "security" as const,
      stage: "exploring" as const,
      currentTarget: { topic: "CTF", entityType: "topic" as const },
      workflow: "learning_explanation" as const,
    },
    conversation: {
      lastTopic: "CTF",
      lastAnswerDepth: "brief" as const,
      lastMentionedEntities: ["CTF", "Web"],
      lastUserIntent: "explain_concept",
    },
    pending: {},
  };
  const s = normalizeSessionState(valid);
  assert.equal(s.semantic.domain, "security");
  assert.equal(s.semantic.stage, "exploring");
  assert.equal(s.semantic.currentTarget.topic, "CTF");
  assert.equal(s.semantic.workflow, "learning_explanation");
  assert.equal(s.conversation.lastTopic, "CTF");
});

/* ──── Schema version detection ──── */

test("v1 detected and NOT re-migrated", () => {
  const v1 = {
    schemaVersion: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    semantic: { domain: "writing" as const, stage: "refining" as const, currentTarget: { entityType: "article" as const }, workflow: "writing_revision" as const },
    conversation: { lastTopic: "文章开头" },
    pending: {},
  };
  const s = normalizeSessionState(v1);
  assert.equal(s.schemaVersion, 1);
  // Should NOT re-run migration logic — domain stays as-is
  assert.equal(s.semantic.domain, "writing");
  assert.equal(s.semantic.workflow, "writing_revision");
});

test("v0 detected via missing schemaVersion → migrated", () => {
  const v0 = {
    lastTopic: "什么是 XSS",
    lastAnswerDepth: "brief" as const,
    lastAssistantAnswerSummary: "解释了 XSS 原理",
    lastMentionedEntities: ["XSS"],
    lastUserIntent: "explain_concept" as const,
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
  const s = normalizeSessionState(v0);
  assert.equal(s.schemaVersion, 1);
  // XSS / 安全 → security domain via keyword inference
  assert.equal(s.semantic.domain, "security");
  assert.equal(s.semantic.workflow, "none");
});

/* ──── lastTransition preserved ──── */

test("lastTransition preserved through normalize", () => {
  const raw = {
    schemaVersion: 1,
    updatedAt: "2026-06-26T00:00:00.000Z",
    semantic: { domain: "learning" as const, stage: "drafting" as const, currentTarget: { topic: "考研" }, workflow: "learning_plan" as const },
    conversation: {},
    pending: {},
    lastTransition: {
      transitionType: "deepen_current_flow" as const,
      reason: "用户从咨询转到计划草稿",
      fromStage: "exploring" as const,
      toStage: "drafting" as const,
      fromDomain: "learning" as const,
      toDomain: "learning" as const,
    },
  };
  const s = normalizeSessionState(raw);
  assert.ok(s.lastTransition);
  assert.equal(s.lastTransition!.transitionType, "deepen_current_flow");
  assert.equal(s.lastTransition!.reason, "用户从咨询转到计划草稿");
});
