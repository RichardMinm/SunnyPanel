import {
  completeStructured,
  type CompleteStructuredOptions,
  type StructuredLLMResult,
} from "@/lib/agent/llm/complete-structured";
import {
  inferAgentMemoryType,
  persistMemoryWithEmbedding,
  scoreAgentMemoryRelevance,
  type AgentMemoryDocument,
  type AgentMemoryInput,
  type AgentMemoryType,
} from "@/lib/agent/memory";
import type { AgentChatResponse, AgentIntent, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import {
  upsertSuggestion,
  type AgentSuggestionDraft,
} from "@/lib/agent/suggestions";
import { isRecord } from "@/lib/shared/is-record";

export type AgentLearningSignal =
  | "correction"
  | "explicit_preference"
  | "explicit_workflow_rule"
  | "inferred";

export type AgentLearningSource = "fallback" | "llm";

export type AgentLearningCandidate = {
  confidence: number;
  content: string;
  reason: string;
  signal: AgentLearningSignal;
  source: AgentLearningSource;
  title: string;
  type: AgentMemoryType;
};

export type AgentLearningDecision = {
  action: "ignore" | "save_memory" | "suggest_memory" | "trace_only";
  candidate?: AgentLearningCandidate;
  existingMemoryId?: number;
  reason: string;
};

export type AgentLearningPolicy = {
  autoSaveThreshold: number;
  correctionSaveThreshold: number;
  traceOnlyThreshold: number;
};

export type AgentLearningStructuredResult = {
  candidates: AgentLearningCandidate[];
};

export type AgentLearningResult = {
  candidates: AgentLearningCandidate[];
  decisions: AgentLearningDecision[];
  savedMemories: AgentMemoryDocument[];
  suggestedMemories: AgentSuggestionDraft[];
  source: AgentLearningSource;
  tokenUsage?: AgentChatResponse["tokenUsage"];
};

type CompleteStructuredLearningFn = (
  options: CompleteStructuredOptions<AgentLearningStructuredResult>,
) => Promise<StructuredLLMResult<AgentLearningStructuredResult> | null>;

type LearningMemory = Pick<AgentMemoryDocument, "content" | "id" | "title" | "type">;

export type RunAgentLearningLoopInput = {
  assistantMessage: string;
  completeStructuredFn?: CompleteStructuredLearningFn;
  existingMemories?: LearningMemory[];
  intent: AgentIntent["intent"];
  message: string;
  pendingActionAfter: null | PendingAction;
  pendingActionBefore: null | PendingAction;
  policy?: Partial<AgentLearningPolicy>;
  pushTrace?: (step: AgentTraceStep) => void;
  sourceThread?: number;
  tokenUsage?: AgentChatResponse["tokenUsage"];
  upsertMemoryFn?: (memory: AgentMemoryInput) => Promise<AgentMemoryDocument>;
  upsertSuggestionFn?: (uniqueKey: string, suggestion?: AgentSuggestionDraft) => Promise<unknown>;
  user?: { id: number };
};

const defaultPolicy: AgentLearningPolicy = {
  autoSaveThreshold: 0.78,
  correctionSaveThreshold: 0.82,
  traceOnlyThreshold: 0.55,
};

const memoryTypes = new Set<AgentMemoryType>([
  "fact",
  "preference",
  "project_context",
  "workflow_rule",
  "writing_style",
]);

const learningSignals = new Set<AgentLearningSignal>([
  "correction",
  "explicit_preference",
  "explicit_workflow_rule",
  "inferred",
]);

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

const compact = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[\s\-_/·，。！？、:：；;（）()《》「」"'“”‘’]/g, "");

const clampConfidence = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0.7;

  if (!Number.isFinite(parsed)) {
    return 0.7;
  }

  return Math.max(0, Math.min(1, parsed));
};

const deriveTitle = (content: string) => {
  const normalized = normalizeWhitespace(content);

  return normalized.length <= 28 ? normalized : `${normalized.slice(0, 28).trimEnd()}...`;
};

const memoryTypeLabelMap: Record<AgentMemoryType, string> = {
  fact: "事实",
  preference: "偏好",
  project_context: "项目上下文",
  workflow_rule: "工作流规则",
  writing_style: "写作风格",
};

const getString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeWhitespace(value);

  return normalized ? normalized : null;
};

const splitSentences = (message: string) =>
  message
    .split(/(?<=[。！？!?])|\n+/)
    .map((sentence) => normalizeWhitespace(sentence.replace(/[。！？!?]+$/g, "")))
    .filter((sentence) => sentence.length > 0);

const stripInstructionLead = (sentence: string) =>
  normalizeWhitespace(
    sentence
      .replace(/^(请你|请|帮我|麻烦你|记住|记一下|以后记得|以后|今后|往后)[:：，,\s]*/, "")
      .replace(/^我(?:喜欢|希望|偏好)[:：，,\s]*/, ""),
  );

const toPreferenceContent = (sentence: string) => {
  const stripped = stripInstructionLead(sentence);

  if (/^(回答|回复|默认|先|少|短|长|直接|不要|别|避免)/.test(stripped)) {
    return `用户偏好${stripped}`;
  }

  return stripped.startsWith("用户") ? stripped : `用户偏好${stripped}`;
};

const isExplicitPreferenceSentence = (sentence: string) =>
  /(?:记住|记一下|以后|今后|往后|每次|每次都|默认|我喜欢|我希望|偏好|回答时|回复时|先给结论|先说结论|少一点铺垫|短答案)/.test(
    sentence,
  );

const isNegativeWorkflowSentence = (sentence: string) =>
  /(?:不要|别|不再|避免|不要再|别再|不应默认|不要默认|不默认|必须|优先).{2,80}/.test(sentence);

const buildPreferenceCandidate = (sentence: string): AgentLearningCandidate => {
  const content = toPreferenceContent(sentence);
  const isWorkflow =
    isNegativeWorkflowSentence(sentence) &&
    /(?:计划|规划|排期|日程|创建|保存|写入|工作流|流程|默认)/.test(sentence) &&
    !/(回答|回复|结论|铺垫|短答案|语气|风格)/.test(sentence);
  const type: AgentMemoryType = isWorkflow ? "workflow_rule" : inferAgentMemoryType(content);

  return {
    confidence: /(?:记住|以后|今后|每次|默认)/.test(sentence) ? 0.9 : 0.82,
    content,
    reason: "用户明确表达了可跨会话复用的偏好或规则。",
    signal: type === "workflow_rule" ? "explicit_workflow_rule" : "explicit_preference",
    source: "fallback",
    title:
      type === "workflow_rule"
        ? deriveTitle(content.replace(/^用户偏好/, ""))
        : /结论|铺垫|短答案|回答|回复/.test(content)
          ? "回答风格偏好"
          : deriveTitle(content),
    type,
  };
};

const isPlanPathCorrection = (message: string, pendingActionBefore: null | PendingAction) => {
  const hasPathLanguage = /(?:路径|路线|建议|方案)/.test(message);
  const rejectsPlan = /(?:不是|并不是|不要|不用|不需要|别).{0,12}(?:计划|规划)|(?:给出|只要|只给).{0,12}(?:路径|路线|建议|方案).{0,12}(?:即可|就行)/.test(
    message,
  );

  return hasPathLanguage && rejectsPlan && pendingActionBefore?.type === "await_learning_followup";
};

const buildPathCorrectionCandidate = (pendingActionBefore: PendingAction): AgentLearningCandidate => {
  const subject =
    pendingActionBefore.type === "await_learning_followup" ? pendingActionBefore.subject : "学习路径或咨询建议";
  const content = `用户在${subject}这类路径/建议请求中不要默认转成计划；除非明确要求创建、保存或排期，否则只回答路径建议。`;

  return {
    confidence: 0.86,
    content,
    reason: "用户纠正了 pending 计划化倾向，明确只需要路径回答。",
    signal: "correction",
    source: "fallback",
    title: "路径建议不默认转计划",
    type: "workflow_rule",
  };
};

const extractLearningCandidatesFallback = (input: {
  message: string;
  pendingActionBefore: null | PendingAction;
}): AgentLearningCandidate[] => {
  const candidates: AgentLearningCandidate[] = [];

  if (isPlanPathCorrection(input.message, input.pendingActionBefore) && input.pendingActionBefore) {
    candidates.push(buildPathCorrectionCandidate(input.pendingActionBefore));
  }

  for (const sentence of splitSentences(input.message)) {
    if (!isExplicitPreferenceSentence(sentence) && !isNegativeWorkflowSentence(sentence)) {
      continue;
    }

    const candidate = buildPreferenceCandidate(sentence);

    if (candidate.content.length >= 8) {
      candidates.push(candidate);
    }
  }

  return dedupeCandidates(candidates);
};

const parseLearningCandidate = (value: unknown): AgentLearningCandidate | null => {
  if (!isRecord(value)) {
    return null;
  }

  const content = getString(value.content);
  const reason = getString(value.reason) ?? "LLM 提取到可复用学习信号。";
  const rawType = getString(value.type);
  const rawSignal = getString(value.signal);
  const type = rawType && memoryTypes.has(rawType as AgentMemoryType) ? (rawType as AgentMemoryType) : null;
  const signal =
    rawSignal && learningSignals.has(rawSignal as AgentLearningSignal) ? (rawSignal as AgentLearningSignal) : null;

  if (!content || !type || !signal) {
    return null;
  }

  return {
    confidence: clampConfidence(value.confidence),
    content,
    reason,
    signal,
    source: "llm",
    title: getString(value.title) ?? deriveTitle(content),
    type,
  };
};

export const parseAgentLearningStructuredResult = (value: unknown): AgentLearningStructuredResult | null => {
  if (!isRecord(value) || !Array.isArray(value.candidates)) {
    return null;
  }

  const candidates = value.candidates
    .map((candidate) => parseLearningCandidate(candidate))
    .filter((candidate): candidate is AgentLearningCandidate => Boolean(candidate))
    .slice(0, 4);

  return {
    candidates: dedupeCandidates(candidates),
  };
};

const dedupeCandidates = (candidates: AgentLearningCandidate[]) => {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = `${candidate.type}:${compact(candidate.content)}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const buildLearningPromptMessages = (input: RunAgentLearningLoopInput) => [
  {
    content:
      "你是 SunnyPanel Agent 的学习闭环分类器。只提取用户明确希望长期复用的偏好、工作流规则、项目上下文或写作风格。不要从普通问题里推断用户画像。只返回 JSON: {\"candidates\":[{\"type\":\"preference|workflow_rule|project_context|writing_style|fact\",\"title\":\"...\",\"content\":\"...\",\"confidence\":0-1,\"signal\":\"explicit_preference|explicit_workflow_rule|correction|inferred\",\"reason\":\"...\"}]}。如果没有明确长期学习信号，返回空 candidates。",
    role: "system" as const,
  },
  {
    content: JSON.stringify(
      {
        assistantMessage: input.assistantMessage.slice(0, 600),
        intent: input.intent,
        pendingActionAfter: input.pendingActionAfter?.type ?? null,
        pendingActionBefore: input.pendingActionBefore?.type ?? null,
        userMessage: input.message,
      },
      null,
      2,
    ),
    role: "user" as const,
  },
];

export const extractLearningCandidatesWithModel = async (
  input: RunAgentLearningLoopInput,
): Promise<{
  candidates: AgentLearningCandidate[];
  source: AgentLearningSource;
  tokenUsage?: AgentChatResponse["tokenUsage"];
}> => {
  const fallbackCandidates = extractLearningCandidatesFallback(input);
  const completeStructuredFn = input.completeStructuredFn ?? completeStructured;
  const structured = await completeStructuredFn({
    fallback: () => null,
    messages: buildLearningPromptMessages(input),
    parse: parseAgentLearningStructuredResult,
    temperature: 0.1,
  });

  if (!structured) {
    return {
      candidates: fallbackCandidates,
      source: "fallback",
    };
  }

  return {
    candidates: structured.data.candidates.map((candidate) => ({
      ...candidate,
      source: "llm",
    })),
    source: "llm",
    tokenUsage: structured.tokenUsage,
  };
};

const isDuplicateMemory = (candidate: AgentLearningCandidate, existingMemories: LearningMemory[]) => {
  const candidateContent = compact(candidate.content);
  const candidateTitle = compact(candidate.title);

  return existingMemories.find((memory) => {
    if (memory.type !== candidate.type) {
      return false;
    }

    const memoryContent = compact(memory.content);
    const memoryTitle = compact(memory.title);

    return (
      memoryContent === candidateContent ||
      (memoryTitle === candidateTitle && candidateTitle.length > 0) ||
      memoryContent.includes(candidateContent) ||
      candidateContent.includes(memoryContent) ||
      scoreAgentMemoryRelevance(memory, candidate.content, "save_memory") >= 70
    );
  });
};

export const evaluateLearningCandidate = (
  candidate: AgentLearningCandidate,
  options: {
    existingMemories?: LearningMemory[];
    pendingActionBefore?: null | PendingAction;
    policy?: Partial<AgentLearningPolicy>;
  } = {},
): AgentLearningDecision => {
  const policy = { ...defaultPolicy, ...options.policy };
  const existing = isDuplicateMemory(candidate, options.existingMemories ?? []);

  if (existing) {
    return {
      action: "ignore",
      candidate,
      existingMemoryId: existing.id,
      reason: "相同或高度相似的长期记忆已存在，跳过重复保存。",
    };
  }

  if (candidate.content.length < 8 || candidate.confidence < policy.traceOnlyThreshold) {
    return {
      action: "ignore",
      candidate,
      reason: "候选内容过短或置信度过低，跳过写入。",
    };
  }

  if (
    (candidate.signal === "explicit_preference" || candidate.signal === "explicit_workflow_rule") &&
    candidate.confidence >= policy.autoSaveThreshold
  ) {
    return {
      action: "save_memory",
      candidate,
      reason: "用户明确表达了长期偏好或工作流规则，允许自动保存为长期记忆。",
    };
  }

  if (
    candidate.signal === "correction" &&
    candidate.confidence >= policy.correctionSaveThreshold &&
    options.pendingActionBefore?.type === "await_learning_followup"
  ) {
    return {
      action: "save_memory",
      candidate,
      reason: "用户纠正了当前 pending 学习计划化倾向，保存为高置信工作流规则。",
    };
  }

  if (candidate.confidence >= policy.traceOnlyThreshold) {
    return {
      action: "suggest_memory",
      candidate,
      reason: "候选可能有长期价值，但不是明确写入指令，先生成可确认的学习建议。",
    };
  }

  return {
    action: "trace_only",
    candidate,
    reason: "候选可能有价值，但不是明确长期偏好，仅进入 trace 观察。",
  };
};

const toMemoryInput = (
  candidate: AgentLearningCandidate,
  input: Pick<RunAgentLearningLoopInput, "sourceThread">,
): AgentMemoryInput => ({
  confidence: candidate.confidence,
  content: candidate.content,
  sourceThread: input.sourceThread,
  title: candidate.title,
  type: candidate.type,
});

const buildLearningSuggestion = (candidate: AgentLearningCandidate): AgentSuggestionDraft => {
  const typeLabel = memoryTypeLabelMap[candidate.type];

  return {
    createdBy: "agent",
    reason: `${candidate.reason} 这条信号还不够明确，点击后会通过记忆写入确认链路保存。`,
    riskLevel: "low",
    source: "dashboard",
    status: "pending",
    suggestedPrompt: `记住这条${typeLabel}：${candidate.content}`,
    title: `确认学习${typeLabel}：${candidate.title}`,
    uniqueKey: `learning-memory:${candidate.type}:${compact(candidate.content).slice(0, 72)}`,
  };
};

export const runAgentLearningLoop = async (input: RunAgentLearningLoopInput): Promise<AgentLearningResult> => {
  const extraction = await extractLearningCandidatesWithModel(input);
  const candidates = extraction.candidates;
  const decisions =
    candidates.length > 0
      ? candidates.map((candidate) =>
          evaluateLearningCandidate(candidate, {
            existingMemories: input.existingMemories,
            pendingActionBefore: input.pendingActionBefore,
            policy: input.policy,
          }),
        )
      : [
          {
            action: "ignore" as const,
            reason: "未发现明确长期偏好或工作流规则。",
          },
        ];
  // 默认走带 embedding 的写入入口，确保“学来的记忆”也具备向量，可被语义检索命中。
  const upsert = input.upsertMemoryFn ?? persistMemoryWithEmbedding;
  const upsertLearningSuggestion = input.upsertSuggestionFn ?? upsertSuggestion;
  const savedMemories: AgentMemoryDocument[] = [];
  const suggestedMemories: AgentSuggestionDraft[] = [];

  for (const decision of decisions) {
    if (!decision.candidate) {
      continue;
    }

    if (decision.action === "save_memory") {
      try {
        const memory = await upsert(toMemoryInput(decision.candidate, input));

        savedMemories.push(memory);
      } catch (error) {
        input.pushTrace?.({
          detail: error instanceof Error ? error.message : "Unknown memory write failure",
          id: "learning-loop",
          kind: "error",
          status: "error",
          title: "学习反馈：保存失败",
        });
      }
      continue;
    }

    if (decision.action === "suggest_memory") {
      const suggestion = buildLearningSuggestion(decision.candidate);

      try {
        await upsertLearningSuggestion(suggestion.uniqueKey, suggestion);
        suggestedMemories.push(suggestion);
      } catch (error) {
        input.pushTrace?.({
          detail: error instanceof Error ? error.message : "Unknown learning suggestion failure",
          id: "learning-loop",
          kind: "error",
          status: "error",
          title: "学习反馈：建议生成失败",
        });
      }
    }
  }

  if (savedMemories.length > 0) {
    input.pushTrace?.({
      detail: `保存 ${savedMemories.length} 条长期记忆：${savedMemories.map((memory) => memory.title).join("、")}`,
      id: "learning-loop",
      kind: "write",
      status: "done",
      title: "学习反馈：保存长期记忆",
    });
  } else if (candidates.length > 0) {
    input.pushTrace?.({
      detail:
        suggestedMemories.length > 0
          ? `生成 ${suggestedMemories.length} 条可确认学习建议：${suggestedMemories
              .map((suggestion) => suggestion.title)
              .join("、")}`
          : decisions.map((decision) => decision.reason).join("；"),
      id: "learning-loop",
      kind: "complete",
      status: "done",
      title: suggestedMemories.length > 0 ? "学习反馈：生成确认建议" : "学习反馈：仅记录候选",
    });
  } else {
    input.pushTrace?.({
      detail: "未发现明确长期偏好、工作流规则或可保存纠偏。",
      id: "learning-loop",
      kind: "complete",
      status: "done",
      title: "学习反馈：无需写入",
    });
  }

  return {
    candidates,
    decisions,
    savedMemories,
    suggestedMemories,
    source: extraction.source,
    tokenUsage: extraction.tokenUsage,
  };
};
