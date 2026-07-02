import type { AgentConversationState } from "../conversation/types";
import type {
  AgentSessionState,
  DialogueStage,
  SemanticDomain,
  TransitionType,
} from "./types";
import { sanitizeChecklistDraft } from "../planning/checklist-draft";
import type {
  PlanReadiness,
  PlanReadinessStatus,
  PlanSlotKey,
  PlanSlots,
} from "../planning/readiness";
import type { PlanDraft, PlanDraftStage } from "../planning/draft";

/* ──── Factory ──── */

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
  "exploring", "clarifying", "drafting", "refining", "confirming",
  "executing", "reviewing", "completed",
]);

const VALID_PLAN_SLOT_KEYS = new Set<PlanSlotKey>([
  "goal",
  "deadline",
  "scope",
  "currentProgress",
  "availableTime",
  "successCriteria",
  "priority",
  "deliverables",
  "constraints",
]);

const PLAN_STRING_SLOT_KEYS = new Set<Exclude<PlanSlotKey, "deliverables" | "constraints">>([
  "goal",
  "deadline",
  "scope",
  "currentProgress",
  "availableTime",
  "successCriteria",
  "priority",
]);

const PLAN_READINESS_STATUSES = new Set<PlanReadinessStatus>([
  "insufficient",
  "draftable",
  "confirmable",
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

const normalizeText = (value: string): string => trunc(value.trim().replace(/\s+/g, " "));

const sanitizeStringList = (raw: unknown, maxItems = 12): string[] | undefined => {
  if (!Array.isArray(raw)) return undefined;

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const normalized = normalizeText(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= maxItems) break;
  }

  return result.length > 0 ? result : undefined;
};

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

  result.confirmation = null;
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

  result.clarification = null;
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

  result.toolCall = null;
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

const sanitizePlanSlots = (raw: unknown): PlanSlots | undefined => {
  if (!isRecord(raw)) return undefined;

  const result: PlanSlots = {};
  for (const key of PLAN_STRING_SLOT_KEYS) {
    const value = raw[key];
    if (typeof value === "string") {
      const normalized = normalizeText(value);
      if (normalized) {
        result[key] = normalized;
      }
    } else if (value === null) {
      result[key] = null;
    }
  }

  for (const key of ["deliverables", "constraints"] as const) {
    const value = raw[key];
    if (value === null) {
      result[key] = null;
      continue;
    }

    const items = sanitizeStringList(value);
    if (items) {
      result[key] = items;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
};

const sanitizePlanSlotKeys = (raw: unknown): PlanSlotKey[] => {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<PlanSlotKey>();
  const result: PlanSlotKey[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || !VALID_PLAN_SLOT_KEYS.has(item as PlanSlotKey)) {
      continue;
    }
    const key = item as PlanSlotKey;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }

  return result;
};

const sanitizePlanReadiness = (
  raw: unknown,
): PlanReadiness | undefined => {
  if (!isRecord(raw)) return undefined;
  const status = asString(raw.status);
  const confidence = asNumber(raw.confidence);

  if (!status || !PLAN_READINESS_STATUSES.has(status as PlanReadinessStatus) || confidence === undefined) {
    return undefined;
  }

  const readiness = {
    confidence: Math.max(0, Math.min(1, confidence)),
    knownSlots: sanitizePlanSlotKeys(raw.knownSlots),
    missingSlots: sanitizePlanSlotKeys(raw.missingSlots),
    reason: asString(raw.reason) != null ? normalizeText(asString(raw.reason)!) : "",
    status: status as PlanReadinessStatus,
    suggestedQuestions: sanitizeStringList(raw.suggestedQuestions, 5) ?? [],
  };

  return readiness;
};

const sanitizePlanDraftStage = (raw: unknown): PlanDraftStage | undefined => {
  if (!isRecord(raw)) return undefined;

  const title = asString(raw.title);
  const tasks = sanitizeStringList(raw.tasks, 12);
  if (!title || !normalizeText(title) || !tasks) {
    return undefined;
  }

  const description = asString(raw.description);
  const startDate = asString(raw.startDate);
  const endDate = asString(raw.endDate);

  return {
    title: normalizeText(title),
    ...(description && normalizeText(description) ? { description: normalizeText(description) } : {}),
    tasks,
    ...(startDate !== undefined ? { startDate: startDate ? trunc(startDate) : null } : {}),
    ...(endDate !== undefined ? { endDate: endDate ? trunc(endDate) : null } : {}),
  };
};

const sanitizePlanDraft = (raw: unknown): PlanDraft | null | undefined => {
  if (raw === null) return null;
  if (!isRecord(raw)) return undefined;

  const title = asString(raw.title);
  const goal = asString(raw.goal);
  if (!title || !normalizeText(title) || !goal || !normalizeText(goal)) {
    return undefined;
  }

  const stages = Array.isArray(raw.stages)
    ? raw.stages
        .map(sanitizePlanDraftStage)
        .filter((stage): stage is PlanDraftStage => Boolean(stage))
        .slice(0, 8)
    : [];
  if (stages.length === 0) return undefined;

  const deadline = asString(raw.deadline);
  const scope = asString(raw.scope);
  const currentProgress = asString(raw.currentProgress);
  const availableTime = asString(raw.availableTime);
  const successCriteria = asString(raw.successCriteria);
  const risks = sanitizeStringList(raw.risks, 8);
  const assumptions = sanitizeStringList(raw.assumptions, 8);
  const nextActions = sanitizeStringList(raw.nextActions, 8);
  const sourcePlanId = asNumber(raw.sourcePlanId);

  return {
    title: normalizeText(title),
    goal: normalizeText(goal),
    ...(sourcePlanId !== undefined ? { sourcePlanId } : {}),
    ...(deadline !== undefined ? { deadline: deadline ? normalizeText(deadline) : null } : {}),
    ...(scope !== undefined ? { scope: scope ? normalizeText(scope) : null } : {}),
    ...(currentProgress !== undefined
      ? { currentProgress: currentProgress ? normalizeText(currentProgress) : null }
      : {}),
    ...(availableTime !== undefined ? { availableTime: availableTime ? normalizeText(availableTime) : null } : {}),
    ...(successCriteria !== undefined
      ? { successCriteria: successCriteria ? normalizeText(successCriteria) : null }
      : {}),
    stages,
    ...(risks ? { risks } : {}),
    ...(assumptions ? { assumptions } : {}),
    ...(nextActions ? { nextActions } : {}),
  };
};

const sanitizePlanning = (
  raw: unknown,
): AgentSessionState["planning"] => {
  if (!isRecord(raw)) return undefined;

  const result: AgentSessionState["planning"] = {};
  const workflow = asString(raw.workflow);
  if (workflow === "plan_creation" || workflow === "plan_iteration") {
    result.workflow = workflow;
  }

  const slots = sanitizePlanSlots(raw.slots);
  if (slots) {
    result.slots = slots;
  }

  const readiness = sanitizePlanReadiness(raw.readiness);
  if (readiness) {
    result.readiness = readiness;
  }

  const sourcePlanId = asNumber(raw.sourcePlanId);
  if (sourcePlanId !== undefined) {
    result.sourcePlanId = sourcePlanId;
  }

  const draft = sanitizePlanDraft(raw.draft);
  if (draft !== undefined) {
    result.draft = draft;
  }

  const checklistDraft = sanitizeChecklistDraft(raw.checklistDraft);
  if (checklistDraft !== undefined) {
    result.checklistDraft = checklistDraft;
  }

  const questions = sanitizeStringList(raw.lastSuggestedQuestions, 5);
  if (questions) {
    result.lastSuggestedQuestions = questions;
  }

  const lastUpdatedAt = asString(raw.lastUpdatedAt);
  if (lastUpdatedAt) {
    result.lastUpdatedAt = trunc(lastUpdatedAt);
  }

  return Object.keys(result).length > 0 ? result : undefined;
};

const sanitizeLastTransition = (raw: unknown): AgentSessionState["lastTransition"] => {
  if (!isRecord(raw)) return undefined;
  return {
    transitionType: (
      asString(raw.transitionType) ?? "fallback"
    ) as TransitionType,
    reason: asString(raw.reason) ?? "",
    fromStage: asString(raw.fromStage) as DialogueStage | undefined,
    toStage: asString(raw.toStage) as DialogueStage | undefined,
    fromDomain: asString(raw.fromDomain) as SemanticDomain | undefined,
    toDomain: asString(raw.toDomain) as SemanticDomain | undefined,
  };
};

/* ──── v0 → v1 migration ──── */

const DOMAIN_KEYWORDS: Array<[RegExp, SemanticDomain]> = [
  [/(ctf|夺旗|网络安全|信息安全|网安|蓝队|红队|漏洞|渗透|攻防|XSS|SQL|注入)/i, "security"],
  [/(写作|文章|大纲|润色|标签|摘要|标题|扩写|续写|改写|重写|polish|文案)/i, "writing"],
  // Schedule before planning — "安排" with "日程" is scheduling, not planning
  [/(日程|排期|排入|加入日程|calendar|日程表)/i, "schedule"],
  [/(计划|规划|清单|checklist|拆分|分解|进度)/i, "planning"],
  [/(学习|复习|考研|考试|课程|入门|路线|路径|学习顺序|知识|怎么?学|学.*怎么|怎么.{0,3}[学练练]|高数|线代|概率|英语|政治|专业课)/i, "learning"],
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
      planning: sanitizePlanning(raw.planning),
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
  const maybeTopic = asString(raw.lastTopic) ?? asString((raw as Record<string, unknown>).topic);
  if (maybeTopic) {
    session.semantic.domain = inferDomainFromTopic(maybeTopic) ?? "general";
    session.semantic.currentTarget = { topic: trunc(maybeTopic) };
    session.conversation.lastTopic = trunc(maybeTopic);
  }
  return session;
};
