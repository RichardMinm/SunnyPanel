/**
 * Context Loading Policy v2 — Sections-based selective workspace loading.
 *
 * Replaces the v1 5-level approach with a composable sections model:
 *   - Each section independently decides to load or skip.
 *   - Skipped ≠ empty: SectionResult.status distinguishes the two.
 *   - Presets compose common section combinations.
 *   - allowSecondPass enables post-Router context reload when pre-policy guess was wrong.
 *
 * Feature Flag:
 *   AGENT_CONTEXT_LOADING_POLICY = "0" | unset → old behavior, full 21 queries
 *   AGENT_CONTEXT_LOADING_POLICY = "shadow"     → full load + compute policy, log diff
 *   AGENT_CONTEXT_LOADING_POLICY = "1"          → real selective loading
 *
 * Default: shadow (safe rollout — full data loaded, policy accuracy measured).
 */

import type { AgentWorkbenchMode } from "./workbench-mode";

/* ──── Section Name ──── */

export const SECTION_NAMES = [
  "user",
  "agentRuns",
  "plans",
  "schedules",
  "checklists",
  "content",
  "timeline",
  "writing",
  "memory",
] as const;

export type SectionName = (typeof SECTION_NAMES)[number];

/* ──── Section Result ──── */

export type SectionLoadStatus = "loaded" | "skipped";

/**
 * Wrapper that distinguishes "loaded but empty" from "not loaded at all".
 *
 *   { status: "loaded",  data: [] } → We checked. There are none.
 *   { status: "skipped", data: [] } → We didn't look. Don't assume.
 */
export type SectionResult<T> = {
  status: SectionLoadStatus;
  data: T;
};

export const loadedSection = <T>(data: T): SectionResult<T> => ({
  status: "loaded",
  data,
});

export const skippedSection = <T>(empty: T): SectionResult<T> => ({
  status: "skipped",
  data: empty,
});

/* ──── Schedule DateRange ──── */

export type ScheduleDateRange =
  | { type: "today" }
  | { type: "tomorrow" }
  | { type: "this_week" }
  | { type: "next_week" }
  | { type: "custom"; start: string; end: string };

/* ──── Preset Level (backward-compatible with v1) ──── */

export type ContextLoadingLevel = "minimal" | "schedule" | "writing" | "planning" | "full";

/** Preset section compositions. Custom section sets are also supported. */
export const PRESETS: Record<ContextLoadingLevel, SectionName[]> = {
  minimal:  ["user", "agentRuns", "memory"],
  schedule: ["user", "agentRuns", "memory", "schedules"],
  writing:  ["user", "agentRuns", "memory", "content", "writing"],
  planning: ["user", "agentRuns", "memory", "plans", "checklists"],
  full:     ["user", "agentRuns", "memory", "plans", "checklists", "content", "timeline", "schedules"],
};

/* ──── Context Loading Meta ──── */

export type ContextLoadingMeta = {
  /** Preset level or "custom" for composite requests */
  level: ContextLoadingLevel | "custom";
  /** All section names that were requested this turn */
  sections: SectionName[];
  /** Sections that were actually fetched from DB */
  loadedSections: SectionName[];
  /** Sections that were intentionally skipped */
  skippedSections: SectionName[];
  /** Confidence in the pre-loading policy guess (0-1) */
  confidence: number;
  /** Source of the policy decision */
  source: "workbench" | "pending_action" | "message_keyword" | "last_intent" | "session_state" | "default";
  /** Human-readable reason */
  reason: string;
  /** Whether a post-Router second pass is allowed */
  allowSecondPass: boolean;
  /** Date range for schedules section (when loaded) */
  dateRange?: ScheduleDateRange;
  /** Target document for writing_revision (when loaded) */
  targetDocument?: { entityType: string; entityId: number | string };
  /** Whether a second pass was actually triggered after Router */
  secondPassTriggered?: boolean;
  /** Sections added by the second pass */
  secondPassAddedSections?: SectionName[];
};

/* ──── Context Loading Policy ──── */

export type ContextLoadingPolicy = {
  sections: Set<SectionName>;
  meta: ContextLoadingMeta;
};

/* ──── Feature Flag ──── */

export type ContextLoadingPolicyMode = "off" | "shadow" | "on";

export const getContextLoadingPolicyMode = (): ContextLoadingPolicyMode => {
  const value = process.env.AGENT_CONTEXT_LOADING_POLICY;
  if (value === "1") return "on";
  if (value === "shadow") return "shadow";
  return "off";
};

export const isContextLoadingPolicyEnabled = (): boolean =>
  getContextLoadingPolicyMode() === "on";

export const isContextLoadingPolicyShadow = (): boolean =>
  getContextLoadingPolicyMode() === "shadow";

/* ──── Intent → Sections Mapping ──── */

/** Intents that only need minimal context */
const CHAT_INTENTS = new Set([
  "answer_question",
  "clarify",
  "explain_concept",
  "capability_query",
  "expand_answer",
  "suggest_actions",
]);

/** Intents that need schedule data */
const SCHEDULE_INTENTS = new Set([
  "query_schedule",
  "create_schedule",
  "update_schedule",
  "compose_schedule_item",
]);

/** Intents that need planning data */
const PLANNING_INTENTS = new Set([
  "query_plan",
  "create_plan",
  "update_plan",
  "compose_plan",
  "append_plan_item",
  "complete_plan_item",
  "evaluate_plan",
  "query_progress",
]);

/** Intents that need writing data */
const WRITING_INTENTS = new Set([
  "create_writing",
  "update_writing",
  "refine_writing",
  "compose_timeline_event",
  "add_completion_note",
]);

/** Intents that need the full workspace */
const FULL_INTENTS = new Set([
  "weekly_review",
  "summarize_progress",
]);

/**
 * Map a resolved intent to the sections it requires.
 * Used for: (1) pre-loading guess from pendingAction/lastIntent,
 *          (2) second-pass comparison after Router returns.
 */
export const resolveSectionsFromIntent = (intent: string): SectionName[] => {
  if (FULL_INTENTS.has(intent)) return PRESETS.full;
  if (PLANNING_INTENTS.has(intent)) return PRESETS.planning;
  if (SCHEDULE_INTENTS.has(intent)) return PRESETS.schedule;
  if (WRITING_INTENTS.has(intent)) return PRESETS.writing;
  if (CHAT_INTENTS.has(intent)) return PRESETS.minimal;
  return PRESETS.minimal;
};

/** For second-pass: compute sections the final intent needs. */
export const getRequiredSectionsForIntent = (intent: string): Set<SectionName> =>
  new Set(resolveSectionsFromIntent(intent));

/* ──── Workbench Mode → Level ──── */

const resolveLevelFromWorkbench = (mode: AgentWorkbenchMode): ContextLoadingLevel => {
  switch (mode) {
    case "today":
      return "full";
    case "plan":
    case "execute":
      return "planning";
    case "review":
      return "full";
    case "writing":
      return "writing";
    case "timeline":
      return "writing";
    case "answer":
    case "ask":
      return "minimal";
    default:
      return "minimal";
  }
};

/* ──── Message Keyword Detection ──── */

const SCHEDULE_KW = ["日程", "安排", "今天", "明天", "本周", "下周", "日历", "schedule", "课表"];
const PLANNING_KW = ["计划", "规划", "plan", "任务", "清单", "checklist", "待办", "复盘", "目标"];
const WRITING_KW = ["写", "文章", "帖子", "post", "草稿", "发布", "笔记", "note", "修改", "润色"];
const FULL_KW = ["周报", "总结", "回顾", "review", "进度", "progress", "汇总", "全面"];

type MessageHint = {
  level: ContextLoadingLevel;
  /** Additional signal: does the message imply schedule + planning composition? */
  isComposite?: boolean;
  /** If schedule keywords detected, what date range is implied? */
  dateRange?: ScheduleDateRange;
};

const detectMessageHint = (message: string): MessageHint | null => {
  const normalized = message.toLowerCase();
  const hasSchedule = SCHEDULE_KW.some((kw) => normalized.includes(kw));
  const hasPlanning = PLANNING_KW.some((kw) => normalized.includes(kw));
  const hasWriting = WRITING_KW.some((kw) => normalized.includes(kw));
  const hasFull = FULL_KW.some((kw) => normalized.includes(kw));

  if (hasFull) {
    return { level: "full" };
  }

  /* Composite: schedule + planning → custom sections */
  if (hasSchedule && hasPlanning) {
    return {
      level: "planning", // base level
      isComposite: true,
      dateRange: detectDateRange(normalized),
    };
  }

  if (hasSchedule) {
    return { level: "schedule", dateRange: detectDateRange(normalized) };
  }

  if (hasPlanning) return { level: "planning" };
  if (hasWriting) return { level: "writing" };

  return null;
};

/** Detect implied date range from message keywords. */
const detectDateRange = (normalized: string): ScheduleDateRange | undefined => {
  if (normalized.includes("下周") || normalized.includes("next week")) {
    return { type: "next_week" };
  }
  if (normalized.includes("本周") || normalized.includes("this week") || normalized.includes("这周")) {
    return { type: "this_week" };
  }
  if (normalized.includes("明天") || normalized.includes("tomorrow")) {
    return { type: "tomorrow" };
  }
  if (normalized.includes("今天") || normalized.includes("today")) {
    return { type: "today" };
  }
  // Default: this_week for general schedule references
  return { type: "this_week" };
};

/* ──── Writing Differentiation ──── */

/**
 * For writing intents, determine whether this is creation or revision.
 *   - writing_creation → load recent titles/tags/writing-style for inspiration
 *   - writing_revision → load the specific currentTarget document
 */
export type WritingLoadMode =
  | { type: "creation" }
  | { type: "revision"; entityType: string; entityId: number | string };

export const resolveWritingLoadMode = (
  intent: string,
  currentTarget?: { entityType?: string | null; entityId?: string | number | null } | null,
): WritingLoadMode => {
  /* revision intents → load the existing document */
  const REVISION_INTENTS = new Set([
    "update_writing",
    "refine_writing",
  ]);

  if (REVISION_INTENTS.has(intent) && currentTarget?.entityType && currentTarget?.entityId) {
    return {
      type: "revision",
      entityType: currentTarget.entityType,
      entityId: currentTarget.entityId,
    };
  }

  /* creation intents → load inspiration data */
  return { type: "creation" };
};

/* ──── Main Policy Resolver ──── */

export type ResolvePolicyInput = {
  workbenchMode?: AgentWorkbenchMode | null;
  message: string;
  pendingAction?: { type: string; action?: { intent?: string } } | null;
  lastIntent?: string | null;
  /** Session domain + stage for additional signal */
  sessionDomain?: string | null;
  sessionStage?: string | null;
  /** Current target for writing revision detection */
  currentTarget?: { entityType?: string | null; entityId?: string | number | null } | null;
};

/**
 * Resolve the context loading policy for a turn.
 *
 * Priority (strongest first):
 *   1. pendingAction.action.intent — we're confirming a previous proposal
 *   2. workbenchMode — strongest explicit user signal
 *   3. Message keywords — heuristic fallback (with composite detection)
 *   4. lastIntent — carry-over from previous turn
 *   5. Session domain — contextual signal from coordinator
 *   6. default — minimal
 *
 * Returns both the section set AND metadata for observability.
 */
export const resolveContextLoadingPolicy = (input: ResolvePolicyInput): ContextLoadingPolicy => {
  const { workbenchMode, message, pendingAction, lastIntent, sessionDomain, sessionStage, currentTarget } = input;

  /* 1. Pending action → strong signal from confirmation flow */
  if (pendingAction?.action?.intent) {
    const intent = pendingAction.action.intent;
    const level = resolveLevelFromIntent(intent);
    const sections = new Set(resolveSectionsFromIntent(intent));
    return {
      sections,
      meta: {
        level,
        sections: [...sections],
        loadedSections: [], // filled after actual load
        skippedSections: [], // filled after actual load
        confidence: 0.95,
        source: "pending_action",
        reason: `pending_action:${intent}`,
        allowSecondPass: false, // high confidence
      },
    };
  }

  /* 2. Workbench mode → explicit user signal */
  if (workbenchMode) {
    const level = resolveLevelFromWorkbench(workbenchMode);
    const sections = new Set(PRESETS[level]);
    return {
      sections,
      meta: {
        level,
        sections: [...sections],
        loadedSections: [],
        skippedSections: [],
        confidence: 0.9,
        source: "workbench",
        reason: `workbench:${workbenchMode}`,
        allowSecondPass: level === "minimal", // workbench can still be overridden
      },
    };
  }

  /* 3. Message keywords */
  const hint = detectMessageHint(message);
  if (hint) {
    /* Composite: schedule + planning */
    if (hint.isComposite) {
      const sections = new Set<SectionName>([...PRESETS.planning, "schedules"]);
      return {
        sections,
        meta: {
          level: "custom",
          sections: [...sections],
          loadedSections: [],
          skippedSections: [],
          confidence: 0.7,
          source: "message_keyword",
          reason: "composite: plans + schedules from message keywords",
          allowSecondPass: true,
          dateRange: hint.dateRange,
        },
      };
    }

    const sections = new Set(PRESETS[hint.level]);
    return {
      sections,
      meta: {
        level: hint.level,
        sections: [...sections],
        loadedSections: [],
        skippedSections: [],
        confidence: 0.75,
        source: "message_keyword",
        reason: `message_keyword → ${hint.level}`,
        allowSecondPass: hint.level !== "full",
        dateRange: hint.dateRange,
      },
    };
  }

  /* 4. Last intent carry-over */
  if (lastIntent) {
    const level = resolveLevelFromIntent(lastIntent);
    if (level !== "minimal") {
      const sections = new Set(resolveSectionsFromIntent(lastIntent));
      return {
        sections,
        meta: {
          level,
          sections: [...sections],
          loadedSections: [],
          skippedSections: [],
          confidence: 0.6,
          source: "last_intent",
          reason: `last_intent:${lastIntent}`,
          allowSecondPass: true, // carry-over is uncertain
        },
      };
    }
  }

  /* 5. Session domain → contextual signal */
  if (sessionDomain) {
    const domainLevel = resolveLevelFromDomain(sessionDomain, sessionStage);
    if (domainLevel !== "minimal") {
      const sections = new Set(PRESETS[domainLevel]);
      return {
        sections,
        meta: {
          level: domainLevel,
          sections: [...sections],
          loadedSections: [],
          skippedSections: [],
          confidence: 0.5,
          source: "session_state",
          reason: `session:${sessionDomain}${sessionStage ? `/${sessionStage}` : ""}`,
          allowSecondPass: true,
          /* For writing domain, add targetDocument if available */
          targetDocument: sessionDomain === "writing" && currentTarget?.entityType && currentTarget?.entityId
            ? { entityType: currentTarget.entityType, entityId: currentTarget.entityId }
            : undefined,
        },
      };
    }
  }

  /* 6. Default — minimal */
  const sections = new Set(PRESETS.minimal);
  return {
    sections,
    meta: {
      level: "minimal",
      sections: [...sections],
      loadedSections: [],
      skippedSections: [],
      confidence: 0.3,
      source: "default",
      reason: "default → minimal (no signal)",
      allowSecondPass: true,
    },
  };
};

/* ──── Helpers ──── */

const resolveLevelFromIntent = (intent: string): ContextLoadingLevel => {
  if (FULL_INTENTS.has(intent)) return "full";
  if (PLANNING_INTENTS.has(intent)) return "planning";
  if (SCHEDULE_INTENTS.has(intent)) return "schedule";
  if (WRITING_INTENTS.has(intent)) return "writing";
  return "minimal";
};

const resolveLevelFromDomain = (
  domain: string,
  stage?: string | null,
): ContextLoadingLevel => {
  switch (domain) {
    case "writing":
      return "writing";
    case "planning":
      return "planning";
    case "schedule":
      return "schedule";
    case "learning":
      return "minimal";
    default:
      return "minimal";
  }
};

/* ──── Second-Pass Helper ──── */

/**
 * Compare required sections (from final Router intent) against loaded sections.
 * Returns sections that need to be loaded in a second pass, or empty if none.
 */
export const getMissingSectionsForSecondPass = (
  requiredSections: Set<SectionName>,
  loadedSections: Set<SectionName>,
): SectionName[] => {
  const missing: SectionName[] = [];
  for (const section of requiredSections) {
    if (!loadedSections.has(section)) {
      missing.push(section);
    }
  }
  return missing;
};

/**
 * Merge original and missing sections for a second-pass reload.
 */
export const mergeSectionsForSecondPass = (
  original: Set<SectionName>,
  missing: SectionName[],
): Set<SectionName> => {
  const merged = new Set(original);
  for (const section of missing) {
    merged.add(section);
  }
  return merged;
};
