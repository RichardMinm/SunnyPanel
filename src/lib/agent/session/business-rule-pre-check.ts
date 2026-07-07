/**
 * [R6-C0-B LEGACY] Business Rule Pre-Check.
 *
 * Extracted from rule-pre-check.ts (R6-C0-B).
 * Rules 3-6: Deepen / Schedule-Query / Schedule-Create / Writing-Revision.
 *
 * These are LEGACY HEURISTIC BUSINESS RULES.
 * Used only for AGENT_REQUIRE_LLM=0 legacy hybrid mode.
 * NOT part of AGENT_REQUIRE_LLM=1 protected baseline.
 *
 * Pure functions: no LLM, no tools, no DB, no side effects.
 */

import type { AgentSessionState, TransitionOutput } from "./types";

/* ──── Text Normalization ──── */

const normalizeUserMessage = (message: string): string =>
  message.trim().replace(/\s+/g, " ").toLowerCase();

/* ──── Rule 3: Deepen / Follow-up ──── */

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
  if (/^(更详细|详细|展开|继续|多说|深入|讲细|具体|举例|例子|细说|补充|然后|接着)/.test(normalized)) {
    if (normalized.length <= 15) return true;
  }
  return false;
};

export const getCurrentTopic = (session: AgentSessionState): string | null => {
  if (session.semantic?.currentTarget?.topic) return session.semantic.currentTarget.topic;
  if (session.conversation?.lastTopic) return session.conversation.lastTopic;
  if (session.semantic?.currentTarget?.entityName) return session.semantic.currentTarget.entityName;
  return null;
};

/* ──── Rule 4: Schedule Query ──── */

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
  if (/查看.*(日程安排|日程)/.test(normalized)) return true;
  if (/看看.*(日程安排|日程)/.test(normalized)) return true;
  if (/(最近|近期).*(有什么|有哪些).*(日程|安排)/.test(normalized)) return true;
  if (/^(日程安排|我的日程安排)$/.test(normalized)) return true;
  const hasQueryWord = /有什么|查看|查询|看看|最近|本周|下周|日程|安排/.test(normalized);
  const hasCreateVerb = /安排|加一|创建|新增|排到|定在|开会|添加|新建/.test(normalized);
  if (hasQueryWord && !hasCreateVerb) {
    if (/有什么(日程|安排)/.test(normalized)) return true;
    if (/查看.*(日程|安排)/.test(normalized)) return true;
    if (/看看.*(日程|安排)/.test(normalized)) return true;
    if (/^(本周|下周|最近).*(日程|安排)/.test(normalized)) return true;
    if (/今天.*(做|安排|日程)/.test(normalized) && !/安排|创建|新增/.test(normalized)) return true;
    if (/明天.*(做|安排|日程)/.test(normalized) && !/安排|创建|新增|开会/.test(normalized)) return true;
  }
  return false;
};

/* ──── Rule 5: Schedule Create ──── */

const SCHEDULE_CREATE_MESSAGES = new Set([
  "创建日程", "新增日程", "帮我加一条日程", "添加日程",
]);

export const isScheduleCreateMessage = (message: string): boolean => {
  const normalized = normalizeUserMessage(message);
  if (SCHEDULE_CREATE_MESSAGES.has(normalized)) return true;
  if (/有什么(日程|安排)/.test(normalized)) return false;
  if (/查看.*(日程|安排)/.test(normalized)) return false;
  if (/看看.*(日程|安排)/.test(normalized)) return false;
  const hasCreateVerb = /安排|加一|创建|新增|排到|定在|开会|添加|新建|排到|把它排/.test(normalized);
  const hasTimeRef = /明天|今天|下周|本周|后天|周一|周二|周三|周四|周五|周六|周日|星期|上午|下午|晚上|几点|三点|四点|下周一|下周二|下周三|下周四|下周五|下周六|下周日/.test(normalized);
  if (hasCreateVerb) {
    if (hasTimeRef && /安排|开会|排到|定在/.test(normalized)) return true;
    if (/帮我.*安排/.test(normalized)) return true;
    if (/帮我.*加一/.test(normalized)) return true;
    if (/^(创建|新增|添加).*(日程|安排|会议)/.test(normalized)) return true;
    if (/把它排到/.test(normalized)) return true;
  }
  return false;
};

/* ──── Rule 6: Writing Revision ──── */

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
  if (/^(改|修改|润色|扩写|缩短|精简|重写|续写|改写|调整|修饰)/.test(normalized)) {
    if (normalized.length <= 20) return true;
  }
  if (/(太啰嗦|太短|太长|更正式|更口语|换个说法|语气调整|补充|加一|修改|改一)/.test(normalized)) return true;
  return false;
};

/* ──── Output Builders ──── */

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

const buildScheduleQueryOutput = (): TransitionOutput => ({
  shouldUpdateSession: true,
  sessionPatch: { domain: "schedule", stage: "exploring", workflow: "schedule_composition" },
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

const buildScheduleCreateOutput = (): TransitionOutput => ({
  shouldUpdateSession: true,
  sessionPatch: { domain: "schedule", stage: "drafting", workflow: "schedule_composition" },
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

const buildWritingRevisionOutput = (): TransitionOutput => ({
  shouldUpdateSession: true,
  sessionPatch: { domain: "writing", stage: "refining", workflow: "writing_revision" },
  transitionType: "deepen_current_flow",
  routeHint: {
    source: "rule",
    suggestedAction: "update",
    suggestedTarget: "writing",
    contextualClues: ["当前处于写作流程中", "用户请求修改已有写作内容"],
    expectedIntents: ["writing_revision", "refine_writing", "update_writing"],
    confidence: 0.86,
  },
  reason: "规则前置：当前处于写作流程，用户请求修改文本",
});

/* ──── Input ──── */

export type BusinessRulePreCheckInput = {
  session: AgentSessionState;
  message: string;
};

/**
 * Legacy business rule pre-check. Used only in AGENT_REQUIRE_LLM=0 mode.
 * NOT part of AGENT_REQUIRE_LLM=1 protected baseline.
 */
export const resolveBusinessRulePreCheck = (
  input: BusinessRulePreCheckInput,
): TransitionOutput | null => {
  const { session, message } = input;
  const normalized = normalizeUserMessage(message);
  if (!normalized) return null;

  /* Rule 3: Deepen */
  if (isDeepenMessage(message)) {
    const topic = getCurrentTopic(session);
    if (topic) return buildDeepenOutput(topic);
  }

  /* Rule 4: Schedule Query */
  if (isScheduleQueryMessage(message)) {
    return buildScheduleQueryOutput();
  }

  /* Rule 5: Schedule Create */
  if (isScheduleCreateMessage(message)) {
    return buildScheduleCreateOutput();
  }

  /* Rule 6: Writing Revision */
  if (isWritingRevisionContext(session) && isWritingRevisionMessage(message)) {
    return buildWritingRevisionOutput();
  }

  return null;
};
