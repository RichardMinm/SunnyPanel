# Semantic Session Coordinator v1 — Design Spec

**Date**: 2026-06-26
**Status**: approved
**Phase**: 1 of Agent Architecture 3-phase roadmap (LLM-ify existing pipeline, no skeleton change)

---

## 1. Motivation

### 1.1 Problem

The current Router is a **stateless intent classifier**. Each turn:

```
message → (capability-router | follow-up-router | LLM Router V2) → LLMRouterOutput → mapLLMRouterToIntent → arbitrateAgentIntent → execute
```

Every turn starts from zero. The only cross-turn memory is `conversationState` (`lastTopic`, `depth`, `entities`), used exclusively by the follow-up router to detect "is this a follow-up question about the last topic?"

**Concrete failures of the stateless model:**

- A user editing an article for the 3rd round still gets classified as `create:writing` because the Router doesn't know we're in a revision workflow.
- "继续" (continue) is ambiguous — the Router has no workflow context to disambiguate.
- The user says "帮我制定考研计划 + 排进日程 + 设置每周复盘" — the Router can only pick one intent per turn.

### 1.2 Solution

**Semantic Session Coordinator v1**: A pre-Router hook that maintains a 4-dimensional semantic session state and uses an LLM-driven Transition Engine to update it before each routing decision.

```
Old Session + Message → [Rule Pre-Check] → [Transition Engine (LLM)] → New Session + RouteHint
                                                                              │
                                                   Existing Router Chain ←──┘ (injected as context)
```

The Transition Engine is scoped to **semantic state only**:
- ❌ Does NOT select tools
- ❌ Does NOT dry-run
- ❌ Does NOT execute
- ❌ Does NOT judge write safety
- ✅ Outputs `sessionPatch + routeHint + transitionType + reason`

---

## 2. Architecture Overview

```
                            ┌──────────────────────────────┐
                            │  Semantic Session            │
                            │  Coordinator v1              │
                            │                              │
 Old Session + Message ───▶│  1. normalizeSessionState     │
 + History + Pending        │  2. rulePreCheck             │
                            │     ├─ hit → rule output     │
                            │     └─ miss → 3              │
                            │  3. runTransitionEngine (LLM)│
                            │     ├─ Zod validate          │
                            │     ├─ retry on failure      │
                            │     └─ double-fail → fallback│
                            │  4. guard: shouldUpdate?     │
                            │     ├─ true → applyPatch     │
                            │     └─ false → keep old      │
                            │  5. return { newSession,     │
                            │       routeHint, trace,      │
                            │       transitionOutput }     │
                            └──────────┬───────────────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  ▼                  ▼
            NewSession          RouteHint         TransitionTrace
                    │                  │                  │
                    └──────────────────┼──────────────────┘
                                       │
                                       ▼
                    ┌──────────────────────────────────────┐
                    │  Existing Router Chain               │
                    │  (session context + routeHint         │
                    │   injected as read-only JSON block)  │
                    │                                      │
                    │  capability-router                   │
                    │  → follow-up-router                  │
                    │  → LLM Router V2                     │
                    │  → mapLLMRouterToIntent              │
                    └──────────────┬───────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────────┐
                    │  Arbitration + Dry-Run + Execute     │
                    │  (unchanged)                         │
                    └──────────────┬───────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────────────────┐
                    │  postRouteSessionReconcile           │
                    │  (update lastTopic, currentTarget,   │
                    │   workflow from final arbitration)    │
                    └──────────────────────────────────────┘
```

### 2.1 Component Boundaries

| Component | File | Responsibility |
|-----------|------|----------------|
| **Session Store** | `session/store.ts` | Read/write `AgentSessionState` via `AgentThread.conversationState` (no new DB column) |
| **Session Coordinator** | `session/coordinator.ts` | Orchestrate: normalize → rule → LLM → applyPatch → return. Does NOT persist — persistence is the pipeline's job. |
| **Transition Engine** | `session/transition-engine.ts` | LLM call with Zod validation + retry + fallback. Returns `TransitionOutput`. |
| **Transition Schema** | `session/transition-schema.ts` | Zod schemas for Transition Engine output validation. |
| **Transition Prompt** | `session/transition-prompt.ts` | Build system/user prompts for Transition Engine LLM call. |
| **Rule Pre-Check** | `session/rule-pre-check.ts` | Lightweight regex rules for confirm/cancel/deepen/switch-domain before LLM. |
| **Patch Applicator** | `session/apply-patch.ts` | Pure function: `(old, patch, transition) → new`. Only called when `shouldUpdateSession=true`. |
| **Route Hint Injector** | `session/inject-route-hint.ts` | Build read-only JSON context block for Router prompt, with escape/truncate for prompt injection safety. |
| **Post-Route Reconcile** | `session/reconcile.ts` | After arbitration, update `lastTopic`/`currentTarget`/`workflow` from final intent. |
| **Normalize Session** | `session/normalize-session.ts` | Safe parse + sanitize + migrate v0→v1. |
| **Transition Trace** | `session/transition-trace.ts` | Build `TransitionTrace` for observability. |

---

## 3. Data Model

### 3.1 AgentSessionState (4 groups)

```typescript
// src/lib/agent/session/types.ts

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
  | "confirm_pending_action"     // natural-language confirmation tendency ONLY
  | "cancel_pending_action"
  | "fallback";

export type RouteHintInfluence = "strong_hint" | "weak_hint" | "ignore";

export type RouteHintSource = "transition_engine" | "rule" | "fallback";

export type RouteHint = {
  suggestedAction?: LLMRouterAction;       // reuses LLMRouterAction verbatim
  suggestedTarget?: LLMRouterTarget;       // reuses LLMRouterTarget verbatim
  contextualClues: string[];              // max 5, each ≤ 200 chars after escape
  expectedIntents: string[];              // intent names likely in this workflow
  confidence: number;                     // 0-1
  source: RouteHintSource;
};

export type SessionPatch = {
  domain?: SemanticDomain;
  stage?: DialogueStage;
  currentTarget?: Partial<CurrentTarget>;
  workflow?: WorkflowId;
};

export type CurrentTarget = {
  entityType?: EntityType | null;         // richer than LLMRouterTarget
  entityName?: string | null;
  entityId?: string | number | null;      // Postgres int or MongoDB ObjectId
  topic?: string | null;
};

export type TransitionOutput = {
  shouldUpdateSession: boolean;
  sessionPatch: SessionPatch;             // IGNORED when shouldUpdateSession=false
  routeHint: RouteHint;
  transitionType: TransitionType;
  reason: string;
};

export type AgentSessionState = {
  schemaVersion: number;                  // 1 = current
  updatedAt: string;

  /** Semantic dimensions: domain, stage, target, workflow */
  semantic: {
    domain: SemanticDomain;
    stage: DialogueStage;                 // ⚠️ "executing" ONLY set by UI confirmation event / backend token
    currentTarget: CurrentTarget;
    workflow: WorkflowId;
  };

  /** Conversation metadata from legacy conversationState */
  conversation: {
    lastTopic?: string | null;
    lastAnswerDepth?: "brief" | "expanded" | "detailed";
    lastMentionedEntities?: string[];
    lastUserIntent?: string;
  };

  /** Pending state: preserves confirmation/clarification/tool-call flow */
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

  /** Last transition summary for trace/debug */
  lastTransition?: {
    transitionType: TransitionType;
    reason: string;
    fromStage?: DialogueStage;
    toStage?: DialogueStage;
    fromDomain?: SemanticDomain;
    toDomain?: SemanticDomain;
  };
};

export type TransitionTrace = {
  oldSession: AgentSessionState;
  transitionOutput: TransitionOutput;
  newSession: AgentSessionState;
  routeHint: RouteHint;
  routerOutput?: AgentRouterOutput;
  arbitrationResult?: AgentArbitrationDecision;
};
```

### 3.2 Schema Versioning

| Version | Description |
|---------|-------------|
| `0` (or absent) | Legacy `conversationState` — auto-migrated by `normalizeSessionState()` |
| `1` | Current: 4-group structure |

### 3.3 Enum Reuse

- `suggestedAction` → `LLMRouterAction`: `"cancel" | "capability" | "chat" | "clarify" | "create" | "delete" | "expand_answer" | "explain" | "query" | "summarize" | "update"`
- `suggestedTarget` → `LLMRouterTarget`: `"agent" | "checklist" | "last_topic" | "memory" | "plan" | "schedule" | "timeline" | "unknown" | "writing"`
- `currentTarget.entityType` → `EntityType`: richer set including `article`, `project`, `topic`, `agent`, `unknown`

**Rationale**: `suggestedAction`/`suggestedTarget` feed into the existing Router, so they MUST match the Router's types. `CurrentTarget` describes the session's internal working object, which can be richer.

---

## 4. Session Lifecycle

### 4.1 normalizeSessionState()

```typescript
// src/lib/agent/session/normalize-session.ts

export const normalizeSessionState = (raw: unknown): AgentSessionState => {
  // null / undefined / non-object → createDefaultSessionState()
  // v1+ (schemaVersion >= 1) → sanitize each group independently
  // v0 (legacy conversationState) → infer domain/stage from lastTopic/lastUserIntent
  //                                   workflow always "none" (conservative)
  // malformed → createDefaultSessionState()
};
```

**Key behaviors:**
- `createDefaultSessionState()` is a factory function (not a shared constant) to avoid timestamp/reference reuse.
- Sanitize: every field is validated against its enum set; unknown values fall back to defaults.
- Legacy migration: `domain` inferred via keyword match on `lastTopic`; `stage` inferred from `lastUserIntent`; `workflow` stays `"none"` because confidence is too low without seeing the full conversation.

### 4.2 Coordinator Flow

```typescript
// src/lib/agent/session/coordinator.ts

export const runSessionCoordinator = async (input: SessionCoordinatorInput): Promise<SessionCoordinatorOutput> => {
  // 1. normalize
  const oldSession = normalizeSessionState(input.sessionRaw);

  // 2. rule pre-check
  const ruleResult = rulePreCheck(oldSession, input.message, input.pendingAction);
  let transitionOutput: TransitionOutput;

  if (ruleResult) {
    transitionOutput = ruleResult;                          // source = "rule"
  } else {
    try {
      transitionOutput = await runTransitionEngine({...});  // source = "transition_engine"
    } catch {
      transitionOutput = buildFallbackTransition(oldSession); // source = "fallback"
    }
  }

  // 3. P0-1: ONLY apply patch when shouldUpdateSession is true
  const newSession = transitionOutput.shouldUpdateSession
    ? applySessionPatch(oldSession, transitionOutput.sessionPatch, transitionOutput)
    : oldSession;

  // 4. P0-1 (follow-up): when shouldUpdateSession=false and source=transition_engine,
  //    cap routeHint confidence at 0.5 — it's a weak signal only
  if (!transitionOutput.shouldUpdateSession && transitionOutput.routeHint.source === "transition_engine") {
    transitionOutput.routeHint.confidence = Math.min(transitionOutput.routeHint.confidence, 0.5);
  }

  // 5. build trace (pipeline persists later)
  const trace: TransitionTrace = {
    oldSession,
    transitionOutput,
    newSession,
    routeHint: transitionOutput.routeHint,
  };

  return { newSession, routeHint: transitionOutput.routeHint, trace, transitionOutput };
};
```

**Persistence boundary**: `runSessionCoordinator` returns `newSession` but does NOT persist it. The calling pipeline (`resolve-intent-step.ts`) is responsible for writing `newSession` back to `AgentThread.conversationState` via `persistAgentTurn`.

### 4.3 applySessionPatch() (Pure Function)

```typescript
// src/lib/agent/session/apply-patch.ts

export const applySessionPatch = (
  old: AgentSessionState,
  patch: SessionPatch,
  transition: TransitionOutput,
): AgentSessionState => {
  const next = structuredClone(old);
  next.updatedAt = new Date().toISOString();

  if (patch.domain !== undefined) next.semantic.domain = patch.domain;
  if (patch.stage !== undefined) {
    // P0-3: "executing" can ONLY be set by the pipeline after UI confirmation,
    // never by Transition Engine. Guard against LLM hallucination.
    next.semantic.stage = patch.stage === "executing" ? "confirming" : patch.stage;
  }
  if (patch.currentTarget) {
    next.semantic.currentTarget = {
      ...next.semantic.currentTarget,
      ...patch.currentTarget,
    };
  }
  if (patch.workflow !== undefined) next.semantic.workflow = patch.workflow;

  // When domain changes, reset currentTarget (old target belongs to old domain)
  if (patch.domain && patch.domain !== old.semantic.domain) {
    next.semantic.currentTarget = patch.currentTarget?.topic
      ? { topic: patch.currentTarget.topic }
      : {};
  }

  // Record transition
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

### 4.4 postRouteSessionReconcile() (P1-7)

```typescript
// src/lib/agent/session/reconcile.ts

/**
 * After Router + Arbitration produce a final intent, reconcile the session:
 * - Update conversation.lastTopic from intent target
 * - Update semantic.currentTarget from confirmed entity
 * - Downgrade/upgrade workflow based on confirmed intent
 *
 * Called AFTER arbitration, BEFORE persistence.
 */
export const reconcileSessionAfterRoute = (
  session: AgentSessionState,
  arbitrationResult: AgentArbitrationDecision,
  routerOutput?: AgentRouterOutput,
): AgentSessionState => {
  const next = structuredClone(session);
  const intent = arbitrationResult.intent;

  // Update lastTopic from confirmed target
  if (routerOutput?.target.topic) {
    next.conversation.lastTopic = routerOutput.target.topic;
  }
  if (routerOutput?.target.entityName) {
    next.semantic.currentTarget.entityName = routerOutput.target.entityName;
  }
  if (routerOutput?.target.entityType) {
    next.semantic.currentTarget.entityType = routerOutput.target.entityType as EntityType;
  }

  // If arbitration confirmed a write intent, workflow was correct — keep it.
  // If arbitration overrode to answer/clarify, downgrade workflow.
  const isWrite = arbitrationResult.route === "write" || arbitrationResult.requiresWrite;
  if (!isWrite && next.semantic.workflow !== "none" && next.semantic.workflow !== "general_query") {
    // User's intent was NOT a write — they were just asking/exploring
    if (intent.intent === "answer_question" || intent.intent === "clarify") {
      next.semantic.workflow = "general_query";
      next.semantic.stage = "exploring";
    }
  }

  // If arbitration confirmed a plan/schedule/writing write, ensure workflow aligns
  if (isWrite && routerOutput) {
    const action = routerOutput.action;
    if (action === "create" && routerOutput.target.entityType === "writing") {
      next.semantic.workflow = "writing_creation";
    }
    if (action === "update" && routerOutput.target.entityType === "writing") {
      next.semantic.workflow = "writing_revision";
    }
    if (action === "create" && routerOutput.target.entityType === "plan") {
      next.semantic.workflow = "plan_creation";
    }
    if (["update", "delete"].includes(action) && routerOutput.target.entityType === "plan") {
      next.semantic.workflow = "plan_iteration";
    }
  }

  next.updatedAt = new Date().toISOString();
  return next;
};
```

---

## 5. Transition Engine

### 5.1 Zod Schema (P0-5)

```typescript
// src/lib/agent/session/transition-schema.ts

import { z } from "zod";

const semanticDomainSchema = z.enum([
  "general", "learning", "memory", "planning", "schedule", "security", "writing",
]);

const dialogueStageSchema = z.enum([
  "exploring", "drafting", "refining", "confirming", "executing", "reviewing", "completed",
]);

const entityTypeSchema = z.enum([
  "agent", "article", "checklist", "memory", "plan",
  "project", "schedule", "timeline", "topic", "writing", "unknown",
]);

const workflowIdSchema = z.enum([
  "none",
  "writing_creation", "writing_revision",
  "plan_creation", "plan_iteration",
  "schedule_composition",
  "learning_explanation", "learning_plan",
  "memory_curation",
  "general_query",
  "weekly_review",
]);

const llmRouterActionSchema = z.enum([
  "cancel", "capability", "chat", "clarify", "create",
  "delete", "expand_answer", "explain", "query", "summarize", "update",
]);

const llmRouterTargetSchema = z.enum([
  "agent", "checklist", "last_topic", "memory", "plan",
  "schedule", "timeline", "unknown", "writing",
]);

const transitionTypeSchema = z.enum([
  "continue_current_flow",
  "deepen_current_flow",
  "switch_domain",
  "complete_flow",
  "restart_flow",
  "confirm_pending_action",
  "cancel_pending_action",
  "fallback",
]);

export const transitionOutputSchema = z.object({
  shouldUpdateSession: z.boolean(),
  sessionPatch: z.object({
    domain: semanticDomainSchema.optional(),
    stage: dialogueStageSchema.optional(),
    currentTarget: z.object({
      entityType: entityTypeSchema.optional().nullable(),
      entityName: z.string().max(200).optional().nullable(),
      entityId: z.union([z.string(), z.number()]).optional().nullable(),
      topic: z.string().max(200).optional().nullable(),
    }).optional(),
    workflow: workflowIdSchema.optional(),
  }),
  routeHint: z.object({
    suggestedAction: llmRouterActionSchema.optional(),
    suggestedTarget: llmRouterTargetSchema.optional(),
    contextualClues: z.array(z.string().max(200)).max(5),
    expectedIntents: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    source: z.literal("transition_engine"),
  }),
  transitionType: transitionTypeSchema,
  reason: z.string().min(1).max(500),
});

export type TransitionOutputParsed = z.infer<typeof transitionOutputSchema>;
```

### 5.2 Transition Engine Execution

```typescript
// src/lib/agent/session/transition-engine.ts

export const runTransitionEngine = async (input: {
  oldSession: AgentSessionState;
  message: string;
  history: AgentChatMessage[];
  pendingAction: PendingAction | null;
}): Promise<TransitionOutput> => {
  const systemPrompt = buildTransitionSystemPrompt();
  const userPrompt = buildTransitionUserPrompt(input);

  // Attempt 1: temperature=0.1
  const first = await completeStructuredStreaming({
    systemPrompt, userPrompt,
    schema: transitionOutputSchema,
    temperature: 0.1,
  });

  if (first.success && first.data) {
    return mapParsedToOutput(first.data);
  }

  // Attempt 2 (retry): temperature=0.3
  const retry = await completeStructuredStreaming({
    systemPrompt, userPrompt,
    schema: transitionOutputSchema,
    temperature: 0.3,
  });

  if (retry.success && retry.data) {
    return mapParsedToOutput(retry.data);
  }

  // Both failed → throw, caught by Coordinator → fallback
  throw new Error(`Transition Engine double validation failure`);
};
```

### 5.3 Transition Prompt (Key Constraints)

The system prompt MUST enforce:

1. **No tool selection**: "你绝不输出 executeTool / dryRun / toolCall / function_call。"
2. **No write safety judgment**: "你绝不判断写入安全或权限。"
3. **Stage guard**: "confirm_pending_action 仅代表自然语言确认倾向，不代表最终 execute 授权。真正 executing 必须由 UI confirmation event 或后端确认 token 触发。你绝不输出 stage=executing。"
4. **Conservative workflow**: "当不确定时，保持现有 domain / workflow 不变，只更新 stage。workflow 置信度低时保持 none。"
5. **RouteHint as context only**: "routeHint 只是建议，不是最终意图。最终 intent 由下游 Router + Arbitration 产生。"

---

## 6. Rule Pre-Check (P0-2, P1-5)

```typescript
// src/lib/agent/session/rule-pre-check.ts

/**
 * Lightweight regex rules for high-confidence cases.
 * Returns TransitionOutput on match, null to fall through to LLM.
 */
export const rulePreCheck = (
  session: AgentSessionState,
  message: string,
  pendingAction: PendingAction | null,
): TransitionOutput | null => {
  const normalized = message.trim().replace(/\s+/g, "");

  // ── Rule 1: Confirm pending action (P0-2) ──
  if (pendingAction?.type === "await_confirmation") {
    if (/^(确认|执行|好的|可以|没问题|行|ok|yes|对|是的|开始|搞吧|来吧|做吧)[。！!，,；;]?$/.test(normalized)) {
      // P0-2: Do NOT hardcode suggestedAction=create.
      // Infer expectedIntents from pending action intent instead.
      return {
        shouldUpdateSession: true,
        sessionPatch: { stage: "confirming" },
        routeHint: {
          source: "rule",
          // P0-2: No suggestedAction — let Router decide from pending intent
          contextualClues: [
            `用户确认了待处理动作: ${pendingAction.action.summary}`,
            `pending intent: ${pendingAction.action.intent}`,
          ],
          expectedIntents: [pendingAction.action.intent],
          confidence: 0.98,
        },
        transitionType: "confirm_pending_action",
        reason: `规则前置: 用户确认了待处理动作「${pendingAction.action.summary}」`,
      };
    }

    if (/^(取消|不要|算了|不了|不用|放弃|别|停止|停)[。！!，,；;]?$/.test(normalized)) {
      return {
        shouldUpdateSession: true,
        sessionPatch: { stage: "exploring", workflow: "none" },
        routeHint: {
          source: "rule",
          contextualClues: ["用户取消了待处理动作"],
          expectedIntents: [],
          confidence: 0.98,
        },
        transitionType: "cancel_pending_action",
        reason: `规则前置: 用户取消了待处理动作「${pendingAction.action.summary}」`,
      };
    }
  }

  // ── Rule 2: Deepen / expand signal ──
  const deepenPattern = /(更加详细|更详细|详细一点|展开说说|展开讲|多说一点|深入一点|继续讲|讲细一点|再具体一点|具体一点|能不能细说|补充细节)/;
  if (deepenPattern.test(normalized)) {
    return {
      shouldUpdateSession: false,
      sessionPatch: {
        stage: session.semantic.stage === "exploring" ? "exploring" : "refining",
      },
      routeHint: {
        source: "rule",
        suggestedAction: "expand_answer",
        suggestedTarget: "last_topic",
        contextualClues: [
          `用户请求展开当前主题: ${(session.semantic.currentTarget.topic ?? session.conversation.lastTopic ?? "未知").slice(0, 80)}`,
        ],
        expectedIntents: ["expand_answer", "explain_concept", "give_examples"],
        confidence: 0.9,
      },
      transitionType: "deepen_current_flow",
      reason: `规则前置: 检测到深化信号, 保持在 ${session.semantic.domain}`,
    };
  }

  // ── Rule 3: Schedule QUERY (P1-5: split from create) ──
  const scheduleQueryPattern = /(查看|看看|查询|这周|今天.*安排|明天.*安排|日程.*怎么样|日程.*如何|有什么日程)/
  if (scheduleQueryPattern.test(normalized) && !/(加入|排进|安排到|创建|新建)/.test(normalized)) {
    return {
      shouldUpdateSession: true,
      sessionPatch: { domain: "schedule", stage: "exploring", workflow: "general_query" },
      routeHint: {
        source: "rule",
        suggestedAction: "query",
        suggestedTarget: "schedule",
        contextualClues: ["用户在进行日程查询"],
        expectedIntents: ["query_schedule", "query_progress"],
        confidence: 0.82,
      },
      transitionType: "switch_domain",
      reason: "规则前置: 检测到日程查询信号",
    };
  }

  // ── Rule 4: Schedule CREATE (P1-5: split from query) ──
  const scheduleCreatePattern = /(加入日程|排进日程|安排到日程|创建日程|新建日程|添加日程|加个日程)/
  if (scheduleCreatePattern.test(normalized)) {
    return {
      shouldUpdateSession: true,
      sessionPatch: { domain: "schedule", stage: "drafting", workflow: "schedule_composition" },
      routeHint: {
        source: "rule",
        suggestedAction: "create",
        suggestedTarget: "schedule",
        contextualClues: ["用户明确要求创建/安排日程"],
        expectedIntents: ["compose_schedule_item"],
        confidence: 0.85,
      },
      transitionType: "switch_domain",
      reason: "规则前置: 检测到日程创建信号",
    };
  }

  // ── Rule 5: General query signal ──
  const queryPattern = /(查询|查看|进度|怎么样了|做了多少|还剩多少|状态)/
  if (queryPattern.test(normalized) && !/(加入|排进|安排到|创建|新建|写|润色|修改|改一下)/.test(normalized)) {
    return {
      shouldUpdateSession: false,
      sessionPatch: { stage: "exploring" },
      routeHint: {
        source: "rule",
        suggestedAction: "query",
        contextualClues: ["用户在进行进度/状态查询"],
        expectedIntents: ["query_progress", "query_plan_progress", "query_schedule"],
        confidence: 0.78,
      },
      transitionType: "continue_current_flow",
      reason: "规则前置: 检测到查询信号",
    };
  }

  // ── No rule hit → let LLM handle it ──
  return null;
};
```

---

## 7. RouteHint Injection (P0-4, P1-6)

### 7.1 Escape & Truncate for Prompt Injection Safety

```typescript
// src/lib/agent/session/inject-route-hint.ts

const MAX_CLUE_LENGTH = 200;
const MAX_TOPIC_LENGTH = 200;

/** Escape backticks and truncate user-originated strings to prevent prompt injection */
const safeClue = (value: string): string =>
  value.replace(/`/g, "'").slice(0, MAX_CLUE_LENGTH);

const safeTopic = (value?: string | null): string =>
  (value ?? "无").replace(/`/g, "'").slice(0, MAX_TOPIC_LENGTH);

/**
 * Compute how strongly the routeHint should influence the Router.
 * P1-6: RouteHint must not override user input.
 */
export const computeRouteHintInfluence = (routeHint: RouteHint): RouteHintInfluence => {
  if (routeHint.source === "fallback") return "ignore";
  if (routeHint.confidence >= 0.85) return "strong_hint";
  if (routeHint.confidence >= 0.5) return "weak_hint";
  return "ignore";
};

const INFLUENCE_INSTRUCTIONS: Record<RouteHintInfluence, string> = {
  strong_hint: "路由提示置信度高，建议优先参考但用户输入仍为最终依据。",
  weak_hint: "路由提示仅作参考，请以用户输入为主。",
  ignore: "路由提示置信度低，请忽略并直接依据用户输入判断。",
};

/**
 * Build a read-only JSON context block for Router prompt injection.
 * P0-4: All user-originated fields are escaped and truncated.
 * The block is explicitly marked "read-only, for context only".
 */
export const buildRouterSessionContext = (
  session: AgentSessionState,
  routeHint: RouteHint,
): string => {
  const influence = computeRouteHintInfluence(routeHint);

  const block = {
    _note: "READ-ONLY context block. User input is the final authority.",
    _influence: influence,
    _influence_note: INFLUENCE_INSTRUCTIONS[influence],
    semantic: {
      domain: session.semantic.domain,
      stage: session.semantic.stage,
      currentTarget: {
        entityType: session.semantic.currentTarget.entityType ?? null,
        entityName: session.semantic.currentTarget.entityName ?? null,
        topic: safeTopic(session.semantic.currentTarget.topic),
      },
      workflow: session.semantic.workflow,
    },
    routeHint: routeHint.confidence > 0 ? {
      suggestedAction: routeHint.suggestedAction ?? null,
      suggestedTarget: routeHint.suggestedTarget ?? null,
      contextualClues: routeHint.contextualClues.map(safeClue),
      expectedIntents: routeHint.expectedIntents,
      confidence: routeHint.confidence,
      source: routeHint.source,
    } : null,
  };

  return `## 语义会话上下文 (Semantic Session Context)\n\`\`\`json\n${JSON.stringify(block, null, 2)}\n\`\`\``;
};
```

### 7.2 Injection Point

In `resolveUnifiedIntent` (`llm-unified.ts`), append `sessionContextBlock` to the Router LLM's system prompt:

```typescript
// Before calling the Router LLM:
const sessionContextBlock = buildRouterSessionContext(session, routeHint);
const enrichedSystemPrompt = `${baseSystemPrompt}\n\n${sessionContextBlock}`;
```

The `capability-router` and `follow-up-router` also receive the session state as function arguments for their own context checks (e.g., follow-up router can use `session.semantic.currentTarget.topic` instead of only `conversationState.lastTopic`).

---

## 8. Pipeline Integration

### 8.1 Modified `resolveAgentIntent()` Flow

```
resolveAgentIntent(input)
  │
  ├─ 1. sessionCoordinator.run(sessionRaw, message, history, pendingAction)
  │     → { newSession, routeHint, trace, transitionOutput }
  │
  ├─ 2. Push transition trace step
  │
  ├─ 3. resolveRouterChain({ session: newSession, routeHint, conversationState, history, message, pendingAction })
  │     → RouterChainResult | null
  │     (capability/follow-up routers receive session context as additional argument)
  │
  ├─ 4. resolveUnifiedIntent({
  │       session: newSession,       // injected into Router LLM prompt
  │       routeHint,                  // injected into Router LLM prompt
  │       deterministicIntent, ...
  │     })
  │     → { arbitration, intent, engine, tokenUsage }
  │
  ├─ 5. reconcileSessionAfterRoute(newSession, arbitration, routerOutput)
  │     → reconciledSession          // P1-7
  │
  ├─ 6. Push reconciliation to trace
  │
  └─ 7. Return { intent, arbitration, engine, session: reconciledSession, trace, ... }
```

### 8.2 Persistence

The calling pipeline (`runResolveIntentStep`) persists `reconciledSession` to `AgentThread.conversationState` via `persistAgentTurn`. The Coordinator does NOT persist directly.

### 8.3 Backward Compatibility

- Old threads with `conversationState` (v0) → auto-migrated by `normalizeSessionState()` on first access.
- Old Router Chain behavior unchanged when `routeHint.confidence === 0` (ignored).
- `isLLMRouterV2Enabled()` flag remains — Transition Engine is a separate concern. Setting `AGENT_LLM_ROUTER_V2=0` still disables the LLM Router V2 but does NOT disable the Transition Engine (it can be disabled separately via `AGENT_SESSION_COORDINATOR=0`).

---

## 9. Test Plan

### 9.1 Unit Tests

```
test/agent/session/
├── normalize-session.test.ts
│   ├── null/undefined → createDefaultSessionState()
│   ├── Legacy conversationState → inferred domain/stage, workflow="none"
│   ├── v1 valid → sanitize passes through
│   ├── v1 malformed (bad enum, missing fields) → sanitize to defaults
│   └── entityId accepts both 42 (number) and "abc123" (string)
│
├── rule-pre-check.test.ts
│   ├── "确认执行" + pending → confirm_pending_action, expectedIntents from pending intent
│   ├── P0-2: confirm_pending_action has NO suggestedAction field
│   ├── "取消" + pending → cancel_pending_action
│   ├── "更加详细" + topic → deepen_current_flow, suggestedAction=expand_answer
│   ├── P1-5: "今天有什么安排" → schedule QUERY (not create)
│   ├── P1-5: "加入日程" → schedule CREATE (not query)
│   ├── "看看进度" → query signal
│   └── Ambiguous input → null (falls through to LLM)
│
├── apply-patch.test.ts
│   ├── shouldUpdateSession=false → session is NOT applied (P0-1)
│   ├── Partial patch → only specified fields updated
│   ├── domain switch → currentTarget reset
│   ├── stage transition: exploring → drafting → refining
│   └── P0-3: "executing" in patch → coerced to "confirming"
│
├── transition-schema.test.ts
│   ├── Valid JSON → parse success
│   ├── Invalid stage → ZodError
│   ├── Invalid domain → ZodError
│   ├── confidence outside [0,1] → ZodError
│   ├── source="transition_engine" → accepted
│   ├── source="rule" → rejected (not in transition_engine schema)
│   └── Absent required fields → ZodError
│
├── transition-engine.test.ts (with LLM mock)
│   ├── First attempt success → returns result, no retry
│   ├── First Zod failure + second success → returns retry result
│   ├── Both fail → throws
│   └── P0-5: output missing `executeTool` field (never present in schema)
│
├── coordinator.test.ts
│   ├── Rule hit → no LLM call
│   ├── Rule miss → LLM called → patch applied
│   ├── LLM throws → fallback transition, session unchanged
│   ├── P0-1: shouldUpdateSession=false → oldSession returned verbatim
│   ├── P0-1: shouldUpdateSession=false + source=transition_engine → confidence capped at 0.5
│   └── P0-3: confirm_pending_action does NOT result in stage=executing
│
├── inject-route-hint.test.ts
│   ├── Normal session → complete JSON block with _note and _influence
│   ├── P0-4: contextualClues with backticks → escaped to single quotes
│   ├── P0-4: topic > 200 chars → truncated
│   ├── fallback source → _influence="ignore"
│   ├── confidence >= 0.85 → _influence="strong_hint"
│   └── Empty routeHint → routeHint: null in JSON block
│
└── reconcile.test.ts (P1-7)
    ├── Write intent confirmed → workflow preserved
    ├── Answer intent overrides write → workflow downgraded to general_query
    ├── Router confirms writing_creation → workflow set to writing_creation
    ├── Router confirms plan_iteration → workflow set to plan_iteration
    └── lastTopic updated from routerOutput.target.topic
```

### 9.2 Integration Tests (E2E)

```
test/agent/session/e2e-pipeline.test.ts

T1: 追问继承 lastTopic
  Round 1: "什么是 CTF？"
    → session.domain=security, currentTarget.topic="CTF", workflow=learning_explanation
  Round 2: "我需要更加详细的信息"
    → rule hits deepen → suggestedAction=expand_answer, suggestedTarget=last_topic
    → session.domain=security (unchanged)

T2: 写作连续修改不重复 create
  Round 1: "帮我写一篇关于 AI 安全的文章"
    → workflow=writing_creation, stage=drafting
  Round 2: "把开头改一下，太啰嗦了"
    → workflow=writing_revision, stage=refining
    → expectedIntents does NOT contain compose_plan or create:writing
    → Router output ≠ create:writing

T3: 计划草案迭代
  Round 1: "制定考研复习计划"
    → workflow=plan_creation, stage=drafting
  Round 2: "把数学部分加 5 道题"
    → workflow=plan_iteration, stage=refining
    → expectedIntents = [modify_record, append_plan_item]

T4: Pending 确认 → confirm_pending_action (NOT executing)
  Set up: pending confirmation for "创建计划「考研复习」"
  Input: "确认执行"
    → rule hit → transitionType=confirm_pending_action
    → session.stage=confirming (NOT executing)
    → routeHint has NO suggestedAction, only expectedIntents

T5: 领域切换
  Set up: session in writing workflow
  Input: "看看我这周的日程"
    → rule hit (schedule query) → transitionType=switch_domain
    → session.domain=schedule, stage=exploring, workflow=general_query

T6: 通用问答
  Input: "今天天气怎么样？"
    → session.domain=general, workflow=general_query

T7: 学习咨询 → 学习计划 (deepen)
  Round 1: "如何准备考研数学？"
    → domain=learning, workflow=learning_explanation, stage=exploring
  Round 2: "帮我制定一个复习计划"
    → transitionType=deepen_current_flow
    → workflow=learning_plan, stage=drafting

T8: 取消 pending
  Set up: pending confirmation
  Input: "算了不做了"
    → rule hit → transitionType=cancel_pending_action
    → stage=exploring, workflow=none

T9: 旧 conversationState 迁移
  Old thread with v0 conversationState
    → normalizeSessionState → schemaVersion=1
    → domain inferred from lastTopic keywords
    → workflow=none (conservative)

T10: LLM 不可用 fallback
  Transition Engine throws (double Zod failure)
    → session unchanged → routeHint source="fallback", confidence=0

T11: routeHint 与 final intent 冲突仲裁 (P1-8)
  Set up: session in learning_explanation, routeHint suggests expand_answer:last_topic
  Input: "展开说说这个计划" (ambiguous: expand or create plan?)
  Router outputs: create:plan (user mentioned "计划")
    → Arbitration: Router wins
    → Session: currentTarget updated to plan via reconcileSessionAfterRoute
    → But lastTopic "该计划" preserved in conversation
```

### 9.3 Regression Tests

- Existing `resolveAgentIntent` tests continue to pass (session defaults to `general/exploring/none`).
- Existing `arbitration` tests unchanged (write safety, pending action handling).
- Existing `router` tests pass with `routeHint.confidence=0` (ignored).
- `AGENT_SESSION_COORDINATOR=0` flag disables Coordinator and falls through to existing behavior.

---

## 10. Error Handling & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Transition Engine network error | Coordinator catches → fallback, session unchanged |
| LLM returns valid JSON but semantically wrong (e.g., stage=executing) | `applyPatch` coerces `executing` → `confirming` |
| Malformed session in DB (v0 with corrupt JSON) | `normalizeSessionState` returns `createDefaultSessionState()` |
| `shouldUpdateSession=false` but patch contains data | Patch is discarded (P0-1) |
| RouteHint injection with emoji/special chars in topic | Escaped by `safeTopic` (backtick → single quote, truncate 200) |
| Pending confirmation with unknown intent | `expectedIntents` empty, Router falls back to normal classification |
| Concurrent requests on same thread | Session read/write is serialized by `persistAgentTurn` (existing behavior) |

---

## 11. Feature Flags

| Flag | Default | Effect |
|------|---------|--------|
| `AGENT_SESSION_COORDINATOR` | `"1"` (enabled) | Set to `"0"` to disable Semantic Session Coordinator entirely |
| `AGENT_LLM_ROUTER_V2` | `"1"` (enabled) | Existing flag, independent — disables LLM Router V2 but not Transition Engine |

---

## 12. File Manifest

```
src/lib/agent/session/
├── types.ts                  # AgentSessionState, TransitionOutput, RouteHint, etc.
├── normalize-session.ts      # normalizeSessionState(), createDefaultSessionState()
├── coordinator.ts            # runSessionCoordinator()
├── transition-engine.ts      # runTransitionEngine() — LLM call + Zod validate + retry
├── transition-schema.ts      # Zod schemas for Transition Engine output
├── transition-prompt.ts      # buildTransitionSystemPrompt(), buildTransitionUserPrompt()
├── rule-pre-check.ts         # rulePreCheck() — regex rules before LLM
├── apply-patch.ts            # applySessionPatch() — pure function
├── inject-route-hint.ts      # buildRouterSessionContext(), computeRouteHintInfluence()
├── reconcile.ts              # reconcileSessionAfterRoute() — P1-7
├── transition-trace.ts       # buildTransitionTraceStep()
└── index.ts                  # barrel export

Modified files:
├── src/lib/agent/intent-resolution.ts   # integrate Coordinator + reconcile
├── src/lib/agent/intent/llm-unified.ts  # inject session context into Router LLM
├── src/lib/agent/chat-pipeline/resolve-intent-step.ts  # persist reconciled session
└── src/lib/agent/router/resolve-router-chain.ts        # accept session + routeHint params

Test files:
test/agent/session/
├── normalize-session.test.ts
├── rule-pre-check.test.ts
├── apply-patch.test.ts
├── transition-schema.test.ts
├── transition-engine.test.ts
├── coordinator.test.ts
├── inject-route-hint.test.ts
├── reconcile.test.ts
└── e2e-pipeline.test.ts
```

---

## 13. Acceptance Criteria

1. ✅ Session persists across turns via `AgentThread.conversationState` (no new DB column).
2. ✅ Old `conversationState` auto-migrates to `AgentSessionState` on first access.
3. ✅ Transition Engine outputs only `sessionPatch + routeHint + reason` — never tool calls.
4. ✅ `shouldUpdateSession=false` → session unchanged; routeHint downgraded to weak/ignore.
5. ✅ `confirm_pending_action` is a semantic label, NOT execute authorization.
6. ✅ RouteHint injected as escaped, read-only JSON block.
7. ✅ Rule pre-check handles confirm/cancel/deepen/schedule-query/schedule-create before LLM.
8. ✅ RouteHint influence is tiered by confidence; Router always treats user input as final authority.
9. ✅ `reconcileSessionAfterRoute` updates session from confirmed arbitration.
10. ✅ All existing Router + Arbitration tests continue to pass.
11. ✅ `AGENT_SESSION_COORDINATOR=0` completely disables the feature.
