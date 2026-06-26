# Semantic Session Coordinator Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement AgentSessionState types, normalizeSessionState (safe parse + v0→v1 migration), and applySessionPatch (pure function), with unit tests. No Router integration, no LLM, no pipeline changes.

**Architecture:** 3 new source files under `src/lib/agent/session/` + 3 test files under `tests/agent/`. Uses Node.js native test runner (`node:test`, `node:assert/strict`) consistent with existing `tests/agent/*.test.ts`.

**Tech Stack:** TypeScript, Node.js native test runner, Zod (for types.ts enum validation only — no runtime Zod parsing in Phase 1).

## Global Constraints

- Do NOT modify any existing file. Only create new files under `src/lib/agent/session/` and `tests/agent/`.
- Do NOT import or call any Router, LLM, or pipeline code.
- Do NOT implement Transition Engine, Rule Pre-Check, Coordinator, or RouteHint injection.
- Legacy `AgentConversationState` (in `src/lib/agent/conversation/types.ts`) is read-only reference — do NOT modify it.
- `createDefaultSessionState()` MUST be a factory function (not a shared constant) to avoid timestamp/reference reuse.
- All user-originated strings (topic, entityName) MUST be truncated to 200 chars in sanitize paths.
- `applySessionPatch` MUST coerce `stage=executing` to `stage=confirming` (per spec P0-3 guard).
- `applySessionPatch` MUST return the original session when `shouldUpdateSession=false` (per spec P0-1).
- Test runner: `node --import tsx --test tests/agent/session/*.test.ts`

---

### Task 1: Create AgentSessionState types

**Files:**
- Create: `src/lib/agent/session/types.ts`

**Interfaces:**
- Produces: `SemanticDomain`, `DialogueStage`, `EntityType`, `WorkflowId`, `TransitionType`, `RouteHintSource`, `CurrentTarget`, `RouteHint`, `SessionPatch`, `TransitionOutput`, `AgentSessionState`, `TransitionTrace` — all consumed by tasks 2 and 3
- Reuses: `LLMRouterAction`, `LLMRouterTarget` from `../router/llm-router-schema` (import type only)
- Reuses: `AgentRouterOutput` from `../router/types` (import type only)
- Reuses: `AgentArbitrationDecision` from `../intent/arbitration` (import type only)

- [ ] **Step 1: Write the types file**

```typescript
// src/lib/agent/session/types.ts

import type { LLMRouterAction, LLMRouterTarget } from "../router/llm-router-schema";

/* ──── Enum types ──── */

export type SemanticDomain =
  | "general" | "learning" | "memory" | "planning"
  | "schedule" | "security" | "writing";

export type DialogueStage =
  | "exploring" | "drafting" | "refining" | "confirming"
  | "executing" | "reviewing" | "completed";

export type EntityType =
  | "agent" | "article" | "checklist" | "memory" | "plan"
  | "project" | "schedule" | "timeline" | "topic"
  | "writing" | "unknown";

export type WorkflowId =
  | "none"
  | "writing_creation" | "writing_revision"
  | "plan_creation" | "plan_iteration"
  | "schedule_composition"
  | "learning_explanation" | "learning_plan"
  | "memory_curation"
  | "general_query"
  | "weekly_review";

export type TransitionType =
  | "continue_current_flow"
  | "deepen_current_flow"
  | "switch_domain"
  | "complete_flow"
  | "restart_flow"
  | "confirm_pending_action"
  | "cancel_pending_action"
  | "fallback";

export type RouteHintInfluence = "strong_hint" | "weak_hint" | "ignore";

export type RouteHintSource = "transition_engine" | "rule" | "fallback";

/* ──── Compound types ──── */

export type CurrentTarget = {
  entityType?: EntityType | null;
  entityName?: string | null;
  entityId?: string | number | null;
  topic?: string | null;
};

export type RouteHint = {
  suggestedAction?: LLMRouterAction;
  suggestedTarget?: LLMRouterTarget;
  contextualClues: string[];
  expectedIntents: string[];
  confidence: number;
  source: RouteHintSource;
};

export type SessionPatch = {
  domain?: SemanticDomain;
  stage?: DialogueStage;
  currentTarget?: Partial<CurrentTarget>;
  workflow?: WorkflowId;
};

export type TransitionOutput = {
  shouldUpdateSession: boolean;
  sessionPatch: SessionPatch;
  routeHint: RouteHint;
  transitionType: TransitionType;
  reason: string;
};

/* ──── AgentSessionState (4 groups) ──── */

export type AgentSessionState = {
  schemaVersion: number;
  updatedAt: string;

  semantic: {
    domain: SemanticDomain;
    stage: DialogueStage;
    currentTarget: CurrentTarget;
    workflow: WorkflowId;
  };

  conversation: {
    lastTopic?: string | null;
    lastAnswerDepth?: "brief" | "expanded" | "detailed";
    lastMentionedEntities?: string[];
    lastUserIntent?: string;
  };

  pending: {
    confirmation?: {
      actionId: string;
      summary: string;
      intent: string;
      riskLevel: "high" | "medium" | "low";
    } | null;
    clarification?: {
      question: string;
      missingFields?: string[];
      intent?: string;
    } | null;
    toolCall?: {
      toolName: string;
      toolArgs: Record<string, unknown>;
      reason: string;
    } | null;
  };

  lastTransition?: {
    transitionType: TransitionType;
    reason: string;
    fromStage?: DialogueStage;
    toStage?: DialogueStage;
    fromDomain?: SemanticDomain;
    toDomain?: SemanticDomain;
  };
};

/* ──── Trace ──── */

export type TransitionTrace = {
  oldSession: AgentSessionState;
  transitionOutput: TransitionOutput;
  newSession: AgentSessionState;
  routeHint: RouteHint;
  routerOutput?: import("../router/types").AgentRouterOutput;
  arbitrationResult?: import("../intent/arbitration").AgentArbitrationDecision;
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/richardluo/Documents/Develop/SunnyPanel && npx tsc --noEmit src/lib/agent/session/types.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/session/types.ts
git commit -m "feat(session): add AgentSessionState and related types

4-group session state (semantic/conversation/pending/lastTransition).
Reuses LLMRouterAction/LLMRouterTarget from existing router types.
EntityType richer than LLMRouterTarget for internal target tracking.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Write normalize-session.test.ts (test-first)

**Files:**
- Create: `tests/agent/session/normalize-session.test.ts`

**Interfaces:**
- Consumes: `AgentSessionState`, `SemanticDomain`, `DialogueStage`, `WorkflowId` from `../../src/lib/agent/session/types`
- Consumes: `normalizeSessionState`, `createDefaultSessionState` from `../../src/lib/agent/session/normalize-session` (will fail initially — TDD)
- Consumes: `AgentConversationState` from `../../src/lib/agent/conversation/types`

- [ ] **Step 1: Write the complete test file (all tests fail initially)**

```typescript
// tests/agent/session/normalize-session.test.ts
import assert from "node:assert/strict";
import { test, describe } from "node:test";
import type { AgentConversationState } from "../../src/lib/agent/conversation/types";

// These imports will fail until normalize-session.ts exists
import { createDefaultSessionState, normalizeSessionState } from "../../src/lib/agent/session/normalize-session";

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
      domain: "planning",
      stage: "drafting",
      currentTarget: { entityType: "plan", entityName: "考研计划", entityId: 42 },
      workflow: "plan_creation",
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
      domain: "writing",
      stage: "refining",
      currentTarget: { entityType: "article", entityId: "abc123def456" },
      workflow: "writing_revision",
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
      domain: "general",
      stage: "exploring",
      currentTarget: { entityId: null },
      workflow: "none",
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
    semantic: { domain: "planning", stage: "confirming", currentTarget: {}, workflow: "plan_creation" },
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
    semantic: { domain: "general", stage: "exploring", currentTarget: {}, workflow: "none" },
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
    semantic: { domain: "memory", stage: "drafting", currentTarget: {}, workflow: "memory_curation" },
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
    semantic: { domain: "general", stage: "exploring", currentTarget: {}, workflow: "none" },
    conversation: {},
    pending: {
      confirmation: { actionId: "a1", summary: "test", intent: "create_plan", riskLevel: "low" },
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
    semantic: { domain: "general", stage: "exploring", currentTarget: {}, workflow: "none" },
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
      domain: "general",
      stage: "exploring",
      currentTarget: { entityName: longString, topic: longString },
      workflow: "none",
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
    semantic: { domain: "writing", stage: "refining", currentTarget: { entityType: "article" }, workflow: "writing_revision" },
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
    semantic: { domain: "learning", stage: "drafting", currentTarget: { topic: "考研" }, workflow: "learning_plan" },
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
```

- [ ] **Step 2: Run tests — all fail (module not found)**

```bash
cd /Users/richardluo/Documents/Develop/SunnyPanel && node --import tsx --test tests/agent/session/normalize-session.test.ts 2>&1 | head -20
```
Expected: All tests fail with `ERR_MODULE_NOT_FOUND` for `../../src/lib/agent/session/normalize-session`.

- [ ] **Step 3: Commit test file**

```bash
git add tests/agent/session/normalize-session.test.ts
git commit -m "test(session): add normalize-session test suite (red)

19 test cases covering: null/undefined defaults, legacy v0→v1
migration, malformed JSON, entityId types, pending preservation,
string truncation, and v1 pass-through.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Implement normalize-session.ts

**Files:**
- Create: `src/lib/agent/session/normalize-session.ts`

**Interfaces:**
- Consumes: `AgentSessionState`, `SemanticDomain`, `DialogueStage`, `EntityType`, `WorkflowId` from `./types`
- Produces: `createDefaultSessionState(): AgentSessionState`, `normalizeSessionState(raw: unknown): AgentSessionState`

- [ ] **Step 1: Implement createDefaultSessionState**

```typescript
// src/lib/agent/session/normalize-session.ts

import type { AgentConversationState } from "../conversation/types";
import type {
  AgentSessionState,
  DialogueStage,
  SemanticDomain,
} from "./types";

/** Factory — always returns a fresh object. Never reuse a shared constant. */
export const createDefaultSessionState = (): AgentSessionState => ({
  schemaVersion: 1,
  updatedAt: new Date().toISOString(),
  semantic: {
    domain: "general",
    stage: "exploring",
    currentTarget: {},
    workflow: "none",
  },
  conversation: {},
  pending: {},
});

/* ──── Type guards ──── */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const asString = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;

const asNumber = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

/* ──── Enum validation sets ──── */

const VALID_DOMAINS = new Set<SemanticDomain>([
  "general", "learning", "memory", "planning", "schedule", "security", "writing",
]);

const VALID_STAGES = new Set<DialogueStage>([
  "exploring", "drafting", "refining", "confirming",
  "executing", "reviewing", "completed",
]);

const VALID_ENTITY_TYPES = new Set([
  "agent", "article", "checklist", "memory", "plan",
  "project", "schedule", "timeline", "topic", "writing", "unknown",
]);

const VALID_WORKFLOWS = new Set([
  "none",
  "writing_creation", "writing_revision",
  "plan_creation", "plan_iteration",
  "schedule_composition",
  "learning_explanation", "learning_plan",
  "memory_curation",
  "general_query",
  "weekly_review",
]);

/* ──── Sanitizers ──── */

const MAX_STRING = 200;

const trunc = (v: string): string =>
  v.length <= MAX_STRING ? v : v.slice(0, MAX_STRING);

const sanitizeCurrentTarget = (
  raw: unknown,
): AgentSessionState["semantic"]["currentTarget"] => {
  if (!isRecord(raw)) return {};
  const entityType = asString(raw.entityType);
  return {
    entityType:
      entityType && VALID_ENTITY_TYPES.has(entityType)
        ? (entityType as AgentSessionState["semantic"]["currentTarget"]["entityType"])
        : undefined,
    entityName:
      asString(raw.entityName) != null ? trunc(asString(raw.entityName)!) : null,
    entityId: asString(raw.entityId) ?? asNumber(raw.entityId) ?? null,
    topic: asString(raw.topic) != null ? trunc(asString(raw.topic)!) : null,
  };
};

const sanitizePending = (
  raw: unknown,
): AgentSessionState["pending"] => {
  if (!isRecord(raw)) return {};
  const result: AgentSessionState["pending"] = {};

  if (isRecord(raw.confirmation)) {
    result.confirmation = {
      actionId: asString(raw.confirmation.actionId) ?? "",
      summary: asString(raw.confirmation.summary) ?? "",
      intent: asString(raw.confirmation.intent) ?? "unknown",
      riskLevel: (
        ["high", "medium", "low"] as const
      ).includes(raw.confirmation.riskLevel as never)
        ? (raw.confirmation.riskLevel as "high" | "medium" | "low")
        : "medium",
    };
  }

  if (isRecord(raw.clarification)) {
    result.clarification = {
      question: asString(raw.clarification.question) ?? "",
      missingFields: Array.isArray(raw.clarification.missingFields)
        ? raw.clarification.missingFields.filter(
            (f): f is string => typeof f === "string",
          )
        : undefined,
      intent: asString(raw.clarification.intent),
    };
  }

  if (isRecord(raw.toolCall)) {
    result.toolCall = {
      toolName: asString(raw.toolCall.toolName) ?? "",
      toolArgs: isRecord(raw.toolCall.toolArgs)
        ? (raw.toolCall.toolArgs as Record<string, unknown>)
        : {},
      reason: asString(raw.toolCall.reason) ?? "",
    };
  }

  return result;
};

const sanitizeSemantic = (
  raw: unknown,
): AgentSessionState["semantic"] => {
  const defaults = createDefaultSessionState().semantic;
  if (!isRecord(raw)) return defaults;
  const domain = asString(raw.domain);
  const stage = asString(raw.stage);
  const workflow = asString(raw.workflow);
  return {
    domain:
      domain && VALID_DOMAINS.has(domain as SemanticDomain)
        ? (domain as SemanticDomain)
        : defaults.domain,
    stage:
      stage && VALID_STAGES.has(stage as DialogueStage)
        ? (stage as DialogueStage)
        : defaults.stage,
    currentTarget: sanitizeCurrentTarget(raw.currentTarget),
    workflow:
      workflow && VALID_WORKFLOWS.has(workflow)
        ? (workflow as AgentSessionState["semantic"]["workflow"])
        : defaults.workflow,
  };
};

const sanitizeConversation = (
  raw: unknown,
): AgentSessionState["conversation"] => {
  if (!isRecord(raw)) return {};
  return {
    lastTopic:
      asString(raw.lastTopic) != null ? trunc(asString(raw.lastTopic)!) : undefined,
    lastAnswerDepth: (
      ["brief", "expanded", "detailed"] as const
    ).includes(raw.lastAnswerDepth as never)
      ? (raw.lastAnswerDepth as "brief" | "expanded" | "detailed")
      : undefined,
    lastMentionedEntities: Array.isArray(raw.lastMentionedEntities)
      ? raw.lastMentionedEntities
          .filter((e): e is string => typeof e === "string")
          .map((e) => trunc(e))
      : undefined,
    lastUserIntent: asString(raw.lastUserIntent) ?? undefined,
  };
};

const sanitizeLastTransition = (raw: unknown) => {
  if (!isRecord(raw)) return undefined;
  return {
    transitionType: (
      asString(raw.transitionType) ?? "fallback"
    ) as AgentSessionState["lastTransition"]["transitionType"],
    reason: asString(raw.reason) ?? "",
    fromStage: asString(raw.fromStage) as DialogueStage | undefined,
    toStage: asString(raw.toStage) as DialogueStage | undefined,
    fromDomain: asString(raw.fromDomain) as SemanticDomain | undefined,
    toDomain: asString(raw.toDomain) as SemanticDomain | undefined,
  };
};

/* ──── v0 → v1 migration helpers ──── */

const DOMAIN_KEYWORDS: Array<[RegExp, SemanticDomain]> = [
  [/(ctf|夺旗|网络安全|信息安全|网安|蓝队|红队|漏洞|渗透|攻防|XSS|SQL|注入)/i, "security"],
  [/(写作|文章|大纲|润色|标签|摘要|标题|扩写|续写|改写|重写|polish|文案)/i, "writing"],
  [/(计划|规划|清单|checklist|拆分|分解|进度|安排)/i, "planning"],
  [/(日程|排期|排入|加入日程|calendar|日程表)/i, "schedule"],
  [/(学习|复习|考研|考试|课程|入门|路线|路径|学习顺序|知识|学.*怎么)/i, "learning"],
  [/(记忆|记住|保存.*偏好|偏好|工作流|规则|习惯)/i, "memory"],
];

const inferDomainFromTopic = (topic?: string | null): SemanticDomain | null => {
  if (!topic) return null;
  for (const [pattern, domain] of DOMAIN_KEYWORDS) {
    if (pattern.test(topic)) return domain;
  }
  return null;
};

const STAGE_FROM_INTENT: Record<string, DialogueStage> = {
  explain_concept: "exploring",
  expand_answer: "exploring",
  give_examples: "exploring",
  give_learning_path: "exploring",
  compare_concepts: "exploring",
  summarize_answer: "exploring",
  rewrite_answer: "exploring",
  compose_plan: "drafting",
  compose_schedule_item: "drafting",
  compose_timeline_event: "drafting",
  create_plan: "drafting",
  save_memory: "drafting",
  modify_record: "refining",
  append_plan_item: "refining",
  complete_plan_item: "refining",
  reschedule_item: "refining",
  delete_record: "refining",
  cancel_schedule_item: "refining",
  weekly_review: "reviewing",
  evaluate_plan: "reviewing",
  query_progress: "exploring",
  query_plan_progress: "exploring",
  query_schedule: "exploring",
};

const inferStageFromIntent = (
  intent: string | undefined,
): DialogueStage | null => {
  if (!intent) return null;
  return STAGE_FROM_INTENT[intent] ?? null;
};

const migrateV0 = (legacy: AgentConversationState): AgentSessionState => {
  const session = createDefaultSessionState();
  const topic = legacy.lastTopic?.trim() || null;

  session.semantic.domain = inferDomainFromTopic(topic) ?? "general";
  session.semantic.stage =
    legacy.pendingConfirmation
      ? "confirming"
      : (inferStageFromIntent(legacy.lastUserIntent) ?? "exploring");
  // Conservative: workflow stays "none" — not enough signal from legacy
  session.semantic.currentTarget = { topic };

  session.conversation = {
    lastTopic: topic,
    lastAnswerDepth: legacy.lastAnswerDepth,
    lastMentionedEntities: legacy.lastMentionedEntities?.map((e) => trunc(e)),
    lastUserIntent: legacy.lastUserIntent,
  };

  if (legacy.pendingConfirmation) {
    session.pending.confirmation = {
      actionId: legacy.pendingConfirmation.actionId ?? "",
      summary: "",
      intent: "",
      riskLevel: "medium",
    };
  }

  return session;
};

/* ──── Main export ──── */

/**
 * Safe parse + sanitize + migrate any input to a valid AgentSessionState.
 *
 * - null / undefined / non-object → createDefaultSessionState()
 * - schemaVersion >= 1 → sanitize each group independently
 * - otherwise (legacy v0 conversationState) → infer domain/stage, workflow="none"
 * - malformed → returns sanitized default
 *
 * NEVER throws.
 */
export const normalizeSessionState = (raw: unknown): AgentSessionState => {
  // null / undefined / non-object → default
  if (!isRecord(raw)) {
    return createDefaultSessionState();
  }

  // v1+ → sanitize
  if (typeof raw.schemaVersion === "number" && raw.schemaVersion >= 1) {
    return {
      schemaVersion: 1,
      updatedAt: asString(raw.updatedAt) ?? new Date().toISOString(),
      semantic: sanitizeSemantic(raw.semantic),
      conversation: sanitizeConversation(raw.conversation),
      pending: sanitizePending(raw.pending),
      lastTransition: sanitizeLastTransition(raw.lastTransition),
    };
  }

  // v0 legacy → migrate
  // Check for characteristic v0 fields (lastTopic is the discriminator)
  if (typeof raw.lastTopic === "string" || "lastAnswerDepth" in raw) {
    return migrateV0(raw as unknown as AgentConversationState);
  }

  // Unknown shape → treat as v0 attempt, fall back to defaults
  const session = createDefaultSessionState();
  // Try to salvage a topic if present
  const maybeTopic = asString(raw.lastTopic) ?? asString((raw as any).topic);
  if (maybeTopic) {
    session.semantic.domain = inferDomainFromTopic(maybeTopic) ?? "general";
    session.semantic.currentTarget = { topic: trunc(maybeTopic) };
    session.conversation.lastTopic = trunc(maybeTopic);
  }
  return session;
};
```

- [ ] **Step 2: Run tests — all pass**

```bash
cd /Users/richardluo/Documents/Develop/SunnyPanel && node --import tsx --test tests/agent/session/normalize-session.test.ts
```
Expected: All 19 tests pass.

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd /Users/richardluo/Documents/Develop/SunnyPanel && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "session" | head -10
```
Expected: No type errors related to session files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/session/normalize-session.ts
git commit -m "feat(session): implement normalizeSessionState with v0→v1 migration

Safe parse + sanitize for any input shape. Legacy AgentConversationState
auto-migrated with conservative keyword-based domain/stage inference.
Workflow stays 'none' for v0 migrations. Never throws.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Write apply-patch.test.ts (test-first)

**Files:**
- Create: `tests/agent/session/apply-patch.test.ts`

**Interfaces:**
- Consumes: `applySessionPatch` from `../../src/lib/agent/session/apply-patch` (will fail initially — TDD)
- Consumes: `createDefaultSessionState`, `normalizeSessionState` from `../../src/lib/agent/session/normalize-session`
- Consumes: Types from `../../src/lib/agent/session/types`

- [ ] **Step 1: Write the complete test file (all tests fail initially)**

```typescript
// tests/agent/session/apply-patch.test.ts
import assert from "node:assert/strict";
import { test, describe } from "node:test";

import { createDefaultSessionState } from "../../src/lib/agent/session/normalize-session";
import type { SessionPatch, TransitionOutput } from "../../src/lib/agent/session/types";

// Will fail until apply-patch.ts exists
import { applySessionPatch } from "../../src/lib/agent/session/apply-patch";

const makeTransition = (
  overrides: Partial<TransitionOutput> = {},
): TransitionOutput => ({
  shouldUpdateSession: overrides.shouldUpdateSession ?? true,
  sessionPatch: overrides.sessionPatch ?? {},
  routeHint: overrides.routeHint ?? {
    source: "transition_engine",
    contextualClues: [],
    expectedIntents: [],
    confidence: 0.8,
  },
  transitionType: overrides.transitionType ?? "continue_current_flow",
  reason: overrides.reason ?? "test transition",
});

/* ──── Acceptance Criterion 6: shouldUpdateSession=false → returns same session ──── */

test("shouldUpdateSession=false returns the same session object", () => {
  const session = createDefaultSessionState();
  const transition = makeTransition({
    shouldUpdateSession: false,
    sessionPatch: { domain: "writing", stage: "drafting" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);

  // Should be the SAME reference (not a clone) since no update needed
  assert.strictEqual(result, session);
  assert.equal(result.semantic.domain, "general"); // unchanged
  assert.equal(result.semantic.stage, "exploring"); // unchanged
});

test("shouldUpdateSession=false ignores patch even with valid data", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "security";
  session.semantic.workflow = "learning_explanation";

  const transition = makeTransition({
    shouldUpdateSession: false,
    sessionPatch: {
      domain: "writing",
      workflow: "writing_creation",
      stage: "refining",
    },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.strictEqual(result, session);
  assert.equal(result.semantic.domain, "security");      // NOT overwritten
  assert.equal(result.semantic.workflow, "learning_explanation"); // NOT overwritten
  assert.equal(result.semantic.stage, "exploring");       // NOT overwritten
});

/* ──── Acceptance Criterion 7: shouldUpdateSession=true → only updates specified fields ──── */

test("shouldUpdateSession=true with empty patch returns updated clone (updatedAt changed)", () => {
  const session = createDefaultSessionState();
  const originalTime = session.updatedAt;
  const transition = makeTransition({
    shouldUpdateSession: true,
    sessionPatch: {},
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  // With empty patch, should still be a new object (updatedAt refreshed)
  assert.notStrictEqual(result, session);
  assert.notStrictEqual(result.updatedAt, originalTime);
});

test("patch.domain only updates domain, leaving other semantic fields unchanged", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "security";
  session.semantic.stage = "exploring";
  session.semantic.workflow = "learning_explanation";

  const transition = makeTransition({
    sessionPatch: { domain: "writing" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.domain, "writing");         // updated
  assert.equal(result.semantic.stage, "exploring");        // unchanged
  assert.equal(result.semantic.workflow, "learning_explanation"); // unchanged
});

test("patch.stage only updates stage", () => {
  const session = createDefaultSessionState();
  const transition = makeTransition({
    sessionPatch: { stage: "refining" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.stage, "refining");
  assert.equal(result.semantic.domain, "general");   // unchanged
  assert.equal(result.semantic.workflow, "none");    // unchanged
});

test("patch.workflow only updates workflow", () => {
  const session = createDefaultSessionState();
  const transition = makeTransition({
    sessionPatch: { workflow: "writing_creation" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.workflow, "writing_creation");
  assert.equal(result.semantic.domain, "general");    // unchanged
  assert.equal(result.semantic.stage, "exploring");   // unchanged
});

test("patch updates multiple fields simultaneously", () => {
  const session = createDefaultSessionState();
  const transition = makeTransition({
    sessionPatch: {
      domain: "planning",
      stage: "drafting",
      workflow: "plan_creation",
      currentTarget: { topic: "考研计划" },
    },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.domain, "planning");
  assert.equal(result.semantic.stage, "drafting");
  assert.equal(result.semantic.workflow, "plan_creation");
  assert.equal(result.semantic.currentTarget.topic, "考研计划");
});

test("patch.currentTarget merges with existing target", () => {
  const session = createDefaultSessionState();
  session.semantic.currentTarget = {
    entityType: "plan",
    entityName: "健身计划",
    entityId: 42,
    topic: "健身",
  };

  const transition = makeTransition({
    sessionPatch: {
      currentTarget: { topic: "增肌计划" }, // only update topic
    },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.currentTarget.topic, "增肌计划");   // updated
  assert.equal(result.semantic.currentTarget.entityType, "plan"); // preserved
  assert.equal(result.semantic.currentTarget.entityName, "健身计划"); // preserved
  assert.equal(result.semantic.currentTarget.entityId, 42);       // preserved
});

test("patch.currentTarget with entityId string", () => {
  const session = createDefaultSessionState();
  const transition = makeTransition({
    sessionPatch: {
      currentTarget: { entityId: "mongo_object_id_abc123" },
    },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.currentTarget.entityId, "mongo_object_id_abc123");
});

/* ──── Acceptance Criterion 8: domain switch → currentTarget handling ──── */

test("domain switch resets currentTarget when no new topic provided", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.currentTarget = {
    entityType: "article",
    entityName: "我的文章",
  };

  const transition = makeTransition({
    sessionPatch: { domain: "schedule" }, // switch domain, no new currentTarget
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.domain, "schedule");
  // currentTarget should be reset to empty (old target belongs to old domain)
  assert.deepStrictEqual(result.semantic.currentTarget, {});
});

test("domain switch with new topic preserves the new topic", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.currentTarget = { entityType: "article", entityName: "我的文章" };

  const transition = makeTransition({
    sessionPatch: {
      domain: "learning",
      currentTarget: { topic: "考研数学" }, // new topic for new domain
    },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.domain, "learning");
  assert.equal(result.semantic.currentTarget.topic, "考研数学");   // new topic preserved
  // Old entityType/entityName should be gone (domain switched)
  assert.equal(result.semantic.currentTarget.entityType, undefined);
  assert.equal(result.semantic.currentTarget.entityName, undefined);
});

test("same domain does NOT reset currentTarget", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.currentTarget = {
    entityType: "article",
    entityName: "我的文章",
  };

  const transition = makeTransition({
    sessionPatch: { stage: "refining" }, // same domain, new stage
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.domain, "writing");
  assert.equal(result.semantic.currentTarget.entityType, "article");  // preserved
  assert.equal(result.semantic.currentTarget.entityName, "我的文章"); // preserved
});

/* ──── P0-3 guard: executing → confirming ──── */

test("stage=executing coerced to confirming (P0-3 guard)", () => {
  const session = createDefaultSessionState();
  const transition = makeTransition({
    sessionPatch: { stage: "executing" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.semantic.stage, "confirming"); // coerced, not executing
});

/* ──── lastTransition recorded ──── */

test("lastTransition recorded on apply", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "general";
  session.semantic.stage = "exploring";

  const transition = makeTransition({
    sessionPatch: { stage: "drafting" },
    transitionType: "deepen_current_flow",
    reason: "用户开始起草计划",
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.ok(result.lastTransition);
  assert.equal(result.lastTransition!.transitionType, "deepen_current_flow");
  assert.equal(result.lastTransition!.reason, "用户开始起草计划");
  assert.equal(result.lastTransition!.fromStage, "exploring");
  assert.equal(result.lastTransition!.toStage, "drafting");
  assert.equal(result.lastTransition!.fromDomain, "general");
  assert.equal(result.lastTransition!.toDomain, "general");
});

test("lastTransition records domain switch", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";

  const transition = makeTransition({
    sessionPatch: { domain: "schedule" },
    transitionType: "switch_domain",
    reason: "用户切换到日程",
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.equal(result.lastTransition!.fromDomain, "writing");
  assert.equal(result.lastTransition!.toDomain, "schedule");
  assert.equal(result.lastTransition!.transitionType, "switch_domain");
});

/* ──── Immutability ──── */

test("does not mutate the original session", () => {
  const session = createDefaultSessionState();
  session.semantic.domain = "writing";
  session.semantic.stage = "exploring";

  const transition = makeTransition({
    sessionPatch: { domain: "planning", stage: "drafting" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);

  // Original unchanged
  assert.equal(session.semantic.domain, "writing");
  assert.equal(session.semantic.stage, "exploring");

  // Result is different
  assert.equal(result.semantic.domain, "planning");
  assert.equal(result.semantic.stage, "drafting");

  // Different objects
  assert.notStrictEqual(result, session);
  assert.notStrictEqual(result.semantic, session.semantic);
});

/* ──── updatedAt refreshed ──── */

test("updatedAt refreshed when shouldUpdateSession=true", async () => {
  const session = createDefaultSessionState();
  session.updatedAt = "2020-01-01T00:00:00.000Z";

  // Small delay to ensure timestamp changes
  await new Promise((r) => setTimeout(r, 5));

  const transition = makeTransition({
    sessionPatch: { stage: "drafting" },
  });

  const result = applySessionPatch(session, transition.sessionPatch, transition);
  assert.notStrictEqual(result.updatedAt, "2020-01-01T00:00:00.000Z");
  assert.ok(new Date(result.updatedAt).getTime() > new Date("2020-01-01").getTime());
});
```

- [ ] **Step 2: Run tests — all fail**

```bash
cd /Users/richardluo/Documents/Develop/SunnyPanel && node --import tsx --test tests/agent/session/apply-patch.test.ts 2>&1 | head -10
```
Expected: All tests fail with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Commit test file**

```bash
git add tests/agent/session/apply-patch.test.ts
git commit -m "test(session): add apply-patch test suite (red)

18 test cases covering: shouldUpdateSession=false no-op,
shouldUpdateSession=true partial updates, domain switch
currentTarget reset, P0-3 executing guard, lastTransition
recording, immutability, and updatedAt refresh.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Implement apply-patch.ts

**Files:**
- Create: `src/lib/agent/session/apply-patch.ts`

**Interfaces:**
- Consumes: `AgentSessionState`, `SessionPatch`, `TransitionOutput` from `./types`
- Produces: `applySessionPatch(old: AgentSessionState, patch: SessionPatch, transition: TransitionOutput): AgentSessionState`

- [ ] **Step 1: Implement applySessionPatch**

```typescript
// src/lib/agent/session/apply-patch.ts

import type { AgentSessionState, SessionPatch, TransitionOutput } from "./types";

/**
 * Apply a SessionPatch to an AgentSessionState.
 *
 * Rules:
 * - shouldUpdateSession=false → returns `old` verbatim (same reference).
 * - shouldUpdateSession=true → returns a NEW session with only the
 *   fields specified in `patch` updated; all other fields preserved.
 * - domain switch (patch.domain !== old.semantic.domain) → currentTarget
 *   reset. If the patch also specifies a new currentTarget.topic, that
 *   topic is preserved in the reset target.
 * - stage="executing" → coerced to "confirming" (P0-3 guard).
 * - lastTransition recorded from transition metadata.
 * - updatedAt refreshed to now.
 *
 * PURE FUNCTION — no side effects, no LLM, no Router.
 */
export const applySessionPatch = (
  old: AgentSessionState,
  patch: SessionPatch,
  transition: TransitionOutput,
): AgentSessionState => {
  // P0-1: shouldUpdateSession=false → return same reference
  if (!transition.shouldUpdateSession) {
    return old;
  }

  // Deep clone via structuredClone (available in Node 18+)
  const next = structuredClone(old) as AgentSessionState;
  next.updatedAt = new Date().toISOString();

  // ── domain ──
  const domainChanged =
    patch.domain !== undefined && patch.domain !== old.semantic.domain;

  if (patch.domain !== undefined) {
    next.semantic.domain = patch.domain;
  }

  // ── stage (P0-3 guard) ──
  if (patch.stage !== undefined) {
    next.semantic.stage =
      patch.stage === "executing" ? "confirming" : patch.stage;
  }

  // ── currentTarget ──
  if (patch.currentTarget) {
    if (domainChanged) {
      // Domain switch: reset currentTarget, keep only new topic if provided
      next.semantic.currentTarget = patch.currentTarget.topic
        ? { topic: patch.currentTarget.topic }
        : {};
    } else {
      // Same domain: merge
      next.semantic.currentTarget = {
        ...next.semantic.currentTarget,
        ...patch.currentTarget,
      };
    }
  } else if (domainChanged) {
    // Domain changed but no new currentTarget → reset
    next.semantic.currentTarget = {};
  }

  // ── workflow ──
  if (patch.workflow !== undefined) {
    next.semantic.workflow = patch.workflow;
  }

  // ── lastTransition ──
  next.lastTransition = {
    transitionType: transition.transitionType,
    reason: transition.reason,
    fromStage: old.semantic.stage,
    toStage: next.semantic.stage,
    fromDomain: old.semantic.domain,
    toDomain: next.semantic.domain,
  };

  return next;
};
```

- [ ] **Step 2: Run tests — all pass**

```bash
cd /Users/richardluo/Documents/Develop/SunnyPanel && node --import tsx --test tests/agent/session/apply-patch.test.ts
```
Expected: All 18 tests pass.

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
cd /Users/richardluo/Documents/Develop/SunnyPanel && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i "session" | head -10
```
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/session/apply-patch.ts
git commit -m "feat(session): implement applySessionPatch pure function

shouldUpdateSession=false → returns same reference.
Domain switch → currentTarget reset with optional new topic.
P0-3 guard coerces stage=executing → confirming.
lastTransition recorded, updatedAt refreshed.
Pure function — no side effects.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Final verification — run all session tests

**Files:**
- Modify: none (verification only)

- [ ] **Step 1: Run all session tests together**

```bash
cd /Users/richardluo/Documents/Develop/SunnyPanel && node --import tsx --test tests/agent/session/normalize-session.test.ts tests/agent/session/apply-patch.test.ts
```
Expected: All 19 + 18 = 37 tests pass.

- [ ] **Step 2: Verify full project TypeScript compilation**

```bash
cd /Users/richardluo/Documents/Develop/SunnyPanel && npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5
```
Expected: No new type errors introduced.

- [ ] **Step 3: Verify existing agent tests still pass (no regression)**

```bash
cd /Users/richardluo/Documents/Develop/SunnyPanel && npm run test:agent 2>&1 | tail -20
```
Expected: All existing tests pass (session types are additive, no imports from agent pipeline).

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "chore(session): verify all session tests pass, no regressions

37 session tests passing. No existing test regressions.
Phase 1 complete.

Co-Authored-By: Claude <noreply@anthropic.com>"
```
