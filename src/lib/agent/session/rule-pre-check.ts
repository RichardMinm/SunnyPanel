/**
 * Rule Pre-Check — Semantic Session Coordinator Phase 2
 *
 * Deterministic, low-cost rules executed BEFORE the Router / LLM Transition Engine.
 * Captures high-confidence semantic state transitions that don't need an LLM.
 *
 * Constraints:
 * - Pure function: no LLM, no tools, no DB, no side effects
 * - Never mutates the input session object
 * - Returns TransitionOutput on rule hit, null on miss
 * - All routeHint.source values must be "rule"
 */

import type { AgentSessionState, RouteHint, SessionPatch, TransitionOutput } from "./types";

/* ──── PendingAction ──── */

export type PendingAction = {
  type: "await_confirmation";
  action: {
    intent: string;
    [key: string]: unknown;
  };
  summary?: string;
};

/* ──── RulePreCheckInput ──── */

export type RulePreCheckInput = {
  session: AgentSessionState;
  message: string;
  pendingAction: PendingAction | null;
};

/* ═══════════════════════════════════════════════════════════════════════
   Text Normalization
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Lightweight message normalization:
 * 1. Trim leading/trailing whitespace
 * 2. Collapse consecutive whitespace
 * 3. Preserve Chinese semantics (do NOT strip all spaces)
 * 4. Lowercase ASCII-only words like "OK" / "yes"
 */
export const normalizeUserMessage = (message: string): string => {
  return message.trim().replace(/\s+/g, " ").toLowerCase();
};

/* ═══════════════════════════════════════════════════════════════════════
   Rule 1: Pending Confirmation — Confirm
   ═══════════════════════════════════════════════════════════════════════ */

const CONFIRM_MESSAGES = new Set([
  "确认", "确认执行", "可以", "可以执行", "没问题", "好的", "好", "行",
  "对", "是的", "开始吧", "执行吧", "做吧", "ok", "yes", "y", "是",
  "确认一下", "可以的", "行吧", "好的好的", "嗯嗯", "搞吧", "动手吧",
]);

/**
 * Strict short-phrase match for pending confirmation.
 * Rejects messages longer than 6 characters (Chinese) or 3 words (English)
 * to avoid false positives like "可以先解释一下吗".
 */
export const isPendingConfirmMessage = (message: string): boolean => {
  const normalized = normalizeUserMessage(message);

  // Direct set match
  if (CONFIRM_MESSAGES.has(normalized)) return true;

  // Also match normalized forms of multi-word confirmations
  if (/^(ok|yes|yep|yeah|sure|go ahead|do it|proceed|confirm|continue)\b/.test(normalized)) {
    // Only match if the message is short (≤ 2 words for English)
    if (normalized.split(/\s+/).length <= 2) return true;
  }

  // Chinese confirm patterns — must be short (≤ 6 chars)
  if (normalized.length <= 6) {
    if (/^(可以|好的|是的|确认|没问题|行|对|开始|执行|做|搞|弄|干)/.test(normalized)) {
      return true;
    }
  }

  return false;
};

/* ──── Pending Confirm Output Builder ──── */

const buildPendingConfirmOutput = (pendingAction: PendingAction): TransitionOutput => {
  const summary = pendingAction.summary ?? pendingAction.action.intent;

  return {
    shouldUpdateSession: true,
    sessionPatch: {
      stage: "confirming",
    },
    transitionType: "confirm_pending_action",
    routeHint: {
      source: "rule",
      expectedIntents: [pendingAction.action.intent],
      contextualClues: [`用户确认了 pending action: ${summary}`],
      confidence: 0.98,
    },
    reason: `规则前置：用户确认了待处理动作「${summary}」`,
  };
};

/* ═══════════════════════════════════════════════════════════════════════
   Rule 2: Pending Confirmation — Cancel
   ═══════════════════════════════════════════════════════════════════════ */

const CANCEL_MESSAGES = new Set([
  "取消", "算了", "不用了", "不要", "别做了", "停止", "放弃", "不了",
  "先不做", "cancel", "no", "n", "别", "不做了", "不用", "算了算了",
  "停", "先不", "先别",
]);

export const isPendingCancelMessage = (message: string): boolean => {
  const normalized = normalizeUserMessage(message);

  if (CANCEL_MESSAGES.has(normalized)) return true;

  // Short Chinese cancel patterns
  if (normalized.length <= 6) {
    if (/^(取消|算了|不用|不要|别|停止|放弃|不了|不搞|不做|先不)/.test(normalized)) {
      return true;
    }
  }

  // English cancel — short only
  if (/^(cancel|no|nope|stop|abort|never\s*mind)\b/.test(normalized)) {
    if (normalized.split(/\s+/).length <= 2) return true;
  }

  return false;
};

/* ──── Pending Cancel Output Builder ──── */

const buildPendingCancelOutput = (pendingAction: PendingAction): TransitionOutput => {
  const summary = pendingAction.summary ?? pendingAction.action.intent;

  return {
    shouldUpdateSession: true,
    sessionPatch: {
      stage: "exploring",
      workflow: "none",
    },
    transitionType: "cancel_pending_action",
    routeHint: {
      source: "rule",
      contextualClues: ["用户取消了 pending action"],
      expectedIntents: [],
      confidence: 0.98,
    },
    reason: `规则前置：用户取消了待处理动作「${summary}」`,
  };
};

/* ═══════════════════════════════════════════════════════════════════════
   Rule 3: Deepen / Follow-up Current Topic
   ═══════════════════════════════════════════════════════════════════════ */

const DEEPEN_MESSAGES = new Set([
  "更详细", "详细一点", "讲详细点", "展开说说", "展开讲", "继续讲",
  "多说一点", "深入一点", "讲细一点", "再具体一点", "具体一点",
  "举个例子", "来个例子", "实际场景呢", "原理是什么",
  "我需要更加详细的信息", "能不能细说", "补充细节",
  "详细说说", "讲得更详细", "进一步解释", "再讲讲",
  "接着说", "然后呢", "继续", "往下说", "详细解释一下",
]);

export const isDeepenMessage = (message: string): boolean => {
  const normalized = normalizeUserMessage(message);

  if (DEEPEN_MESSAGES.has(normalized)) return true;

  // Pattern-based matches
  if (/^(更详细|详细|展开|继续|多说|深入|讲细|具体|举例|例子|细说|补充|然后|接着)/.test(normalized)) {
    if (normalized.length <= 15) return true;
  }

  return false;
};

export const getCurrentTopic = (session: AgentSessionState): string | null => {
  // Priority 1: semantic.currentTarget.topic
  if (session.semantic?.currentTarget?.topic) {
    return session.semantic.currentTarget.topic;
  }

  // Priority 2: conversation.lastTopic
  if (session.conversation?.lastTopic) {
    return session.conversation.lastTopic;
  }

  // Priority 3: semantic.currentTarget.entityName
  if (session.semantic?.currentTarget?.entityName) {
    return session.semantic.currentTarget.entityName;
  }

  return null;
};

/* ──── Deepen Output Builder ──── */

const buildDeepenOutput = (topic: string): TransitionOutput => ({
  shouldUpdateSession: false,
  sessionPatch: {},
  transitionType: "deepen_current_flow",
  routeHint: {
    source: "rule",
    suggestedAction: "expand_answer",
    suggestedTarget: "last_topic",
    contextualClues: [`用户请求展开当前主题「${topic}」`],
    expectedIntents: ["expand_answer", "explain_concept", "give_examples"],
    confidence: 0.9,
  },
  reason: "规则前置：检测到深化信号，保持当前主题继续展开",
});

/* ═══════════════════════════════════════════════════════════════════════
   Rule 4: Schedule Domain — Query
   ═══════════════════════════════════════════════════════════════════════ */

const SCHEDULE_QUERY_MESSAGES = new Set([
  "今天有什么日程", "今天有什么安排", "明天有什么安排", "明天有什么日程",
  "看看我这周的日程", "查询最近安排", "查看日程", "最近有什么安排",
  "本周日程", "下周日程", "今天我要做什么", "明天我要做什么",
  "今天的日程", "明天的日程", "查看本周日程", "查看下周日程",
  "今天安排", "明天安排", "我的日程", "最近日程",
]);

export const isScheduleQueryMessage = (message: string): boolean => {
  const normalized = normalizeUserMessage(message);

  if (SCHEDULE_QUERY_MESSAGES.has(normalized)) return true;

  // Query indicators: 有什么/查看/查询/看看/最近/本周/下周 + no creation verbs
  const hasQueryWord = /有什么|查看|查询|看看|最近|本周|下周|日程|安排/.test(normalized);
  const hasCreateVerb = /安排|加一|创建|新增|排到|定在|开会|添加|新建/.test(normalized);

  if (hasQueryWord && !hasCreateVerb) {
    // Strong query patterns
    if (/有什么(日程|安排)/.test(normalized)) return true;
    if (/查看.*(日程|安排)/.test(normalized)) return true;
    if (/看看.*(日程|安排)/.test(normalized)) return true;
    if (/^(本周|下周|最近).*(日程|安排)/.test(normalized)) return true;
    if (/今天.*(做|安排|日程)/.test(normalized) && !/安排|创建|新增/.test(normalized)) return true;
    if (/明天.*(做|安排|日程)/.test(normalized) && !/安排|创建|新增|开会/.test(normalized)) return true;
  }

  return false;
};

/* ──── Schedule Query Output Builder ──── */

const buildScheduleQueryOutput = (): TransitionOutput => ({
  shouldUpdateSession: true,
  sessionPatch: {
    domain: "schedule",
    stage: "exploring",
    workflow: "schedule_composition",
  },
  transitionType: "switch_domain",
  routeHint: {
    source: "rule",
    suggestedAction: "query",
    suggestedTarget: "schedule",
    contextualClues: ["用户明确在查询日程或安排"],
    expectedIntents: ["query_schedule"],
    confidence: 0.85,
  },
  reason: "规则前置：检测到日程查询信号",
});

/* ═══════════════════════════════════════════════════════════════════════
   Rule 5: Schedule Domain — Create
   ═══════════════════════════════════════════════════════════════════════ */

const SCHEDULE_CREATE_MESSAGES = new Set([
  "创建日程", "新增日程", "帮我加一条日程", "添加日程",
]);

export const isScheduleCreateMessage = (message: string): boolean => {
  const normalized = normalizeUserMessage(message);

  if (SCHEDULE_CREATE_MESSAGES.has(normalized)) return true;

  // Reject query-like messages first (安排/日程 as noun, not verb)
  if (/有什么(日程|安排)/.test(normalized)) return false;
  if (/查看.*(日程|安排)/.test(normalized)) return false;
  if (/看看.*(日程|安排)/.test(normalized)) return false;

  // Create indicators: action verbs
  const hasCreateVerb = /安排|加一|创建|新增|排到|定在|开会|添加|新建|排到|把它排/.test(normalized);
  const hasTimeRef = /明天|今天|下周|本周|后天|周一|周二|周三|周四|周五|周六|周日|星期|上午|下午|晚上|几点|三点|四点|下周一|下周二|下周三|下周四|下周五|下周六|下周日/.test(normalized);

  if (hasCreateVerb) {
    // "明天下午三点安排一个会议" — time + verb
    if (hasTimeRef && /安排|开会|排到|定在/.test(normalized)) return true;
    // "帮我安排一个会议" — helper + create verb
    if (/帮我.*安排/.test(normalized)) return true;
    // "帮我加一条日程" — helper + add
    if (/帮我.*加一/.test(normalized)) return true;
    // "创建日程" / "新增日程" / "把它排到周五"
    if (/^(创建|新增|添加).*(日程|安排|会议)/.test(normalized)) return true;
    if (/把它排到/.test(normalized)) return true;
  }

  return false;
};

/* ──── Schedule Create Output Builder ──── */

const buildScheduleCreateOutput = (): TransitionOutput => ({
  shouldUpdateSession: true,
  sessionPatch: {
    domain: "schedule",
    stage: "drafting",
    workflow: "schedule_composition",
  },
  transitionType: "switch_domain",
  routeHint: {
    source: "rule",
    suggestedAction: "create",
    suggestedTarget: "schedule",
    contextualClues: ["用户明确在创建或安排日程"],
    expectedIntents: ["compose_schedule_item", "create_schedule"],
    confidence: 0.85,
  },
  reason: "规则前置：检测到日程创建信号",
});

/* ═══════════════════════════════════════════════════════════════════════
   Rule 6: Writing Continuous Revision
   ═══════════════════════════════════════════════════════════════════════ */

export const isWritingRevisionContext = (session: AgentSessionState): boolean => {
  const { domain, workflow, currentTarget } = session.semantic;
  return (
    domain === "writing" ||
    workflow === "writing_creation" ||
    workflow === "writing_revision" ||
    currentTarget.entityType === "writing" ||
    currentTarget.entityType === "article"
  );
};

const WRITING_REVISION_MESSAGES = new Set([
  "改一下", "修改一下", "润色", "扩写", "缩短", "精简",
  "更正式", "更口语", "加一段", "补一段", "修改开头", "修改结尾",
  "重写", "续写", "换个说法", "语气调整", "太啰嗦", "太短了",
  "润色一下", "改写", "修改", "改改", "调整一下",
]);

export const isWritingRevisionMessage = (message: string): boolean => {
  const normalized = normalizeUserMessage(message);

  if (WRITING_REVISION_MESSAGES.has(normalized)) return true;

  // Pattern-based matches
  if (/^(改|修改|润色|扩写|缩短|精简|重写|续写|改写|调整|修饰)/.test(normalized)) {
    if (normalized.length <= 20) return true;
  }

  if (/(太啰嗦|太短|太长|更正式|更口语|换个说法|语气调整|补充|加一|修改|改一)/.test(normalized)) {
    return true;
  }

  return false;
};

/* ──── Writing Revision Output Builder ──── */

const buildWritingRevisionOutput = (): TransitionOutput => ({
  shouldUpdateSession: true,
  sessionPatch: {
    domain: "writing",
    stage: "refining",
    workflow: "writing_revision",
  },
  transitionType: "deepen_current_flow",
  routeHint: {
    source: "rule",
    suggestedAction: "update",
    suggestedTarget: "writing",
    contextualClues: [
      "当前处于写作流程中",
      "用户请求修改已有写作内容",
    ],
    expectedIntents: ["writing_revision", "refine_writing", "update_writing"],
    confidence: 0.86,
  },
  reason: "规则前置：当前处于写作流程，用户请求修改文本",
});

/* ═══════════════════════════════════════════════════════════════════════
   Optional Helper: inferActionFromPendingIntent
   ═══════════════════════════════════════════════════════════════════════ */

export const inferActionFromPendingIntent = (
  intent: string,
): "create" | "update" | "delete" | "cancel" | undefined => {
  const lower = intent.toLowerCase();

  if (/create|compose|add|save/.test(lower)) return "create";
  if (/update|modify|reschedule|append|complete/.test(lower)) return "update";
  if (/delete|remove/.test(lower)) return "delete";
  if (/cancel/.test(lower)) return "cancel";

  return undefined;
};

/* ═══════════════════════════════════════════════════════════════════════
   Main: rulePreCheck
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Deterministic rule-based pre-check executed before Router / Transition Engine.
 *
 * Rules are evaluated in priority order. First match wins.
 * Returns TransitionOutput on hit, null on miss.
 *
 * This function is pure:
 * - No LLM calls
 * - No tool calls
 * - No database writes
 * - Does not mutate the input session object
 */
export const rulePreCheck = (
  input: RulePreCheckInput,
): TransitionOutput | null => {
  const { session, message, pendingAction } = input;
  const normalized = normalizeUserMessage(message);

  // Guard: empty message → no match
  if (!normalized) return null;

  /* ── Rule 1: Pending Confirmation Confirm ── */
  if (
    pendingAction?.type === "await_confirmation" &&
    isPendingConfirmMessage(message)
  ) {
    return buildPendingConfirmOutput(pendingAction);
  }

  /* ── Rule 2: Pending Confirmation Cancel ── */
  if (
    pendingAction?.type === "await_confirmation" &&
    isPendingCancelMessage(message)
  ) {
    return buildPendingCancelOutput(pendingAction);
  }

  /* ── Rule 3: Deepen Current Topic ── */
  if (isDeepenMessage(message)) {
    const topic = getCurrentTopic(session);
    if (topic) {
      return buildDeepenOutput(topic);
    }
  }

  /* ── Rule 4: Schedule Query ── */
  if (isScheduleQueryMessage(message)) {
    return buildScheduleQueryOutput();
  }

  /* ── Rule 5: Schedule Create ── */
  if (isScheduleCreateMessage(message)) {
    return buildScheduleCreateOutput();
  }

  /* ── Rule 6: Writing Continuous Revision ── */
  if (isWritingRevisionContext(session) && isWritingRevisionMessage(message)) {
    return buildWritingRevisionOutput();
  }

  /* ── Rule 7: No Match ── */
  return null;
};
