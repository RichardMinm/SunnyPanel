export type AgentMemoryType = "fact" | "preference" | "project_context" | "workflow_rule" | "writing_style";
export type AgentMemoryStatus = "active" | "archived";
type AgentMemoryRelation = null | number | { id?: number };

export type AgentMemoryInput = {
  confidence?: number | string;
  content: string;
  id?: number;
  lastUsedAt?: null | string;
  sourceRun?: AgentMemoryRelation;
  sourceThread?: AgentMemoryRelation;
  status?: AgentMemoryStatus;
  title?: string;
  type?: AgentMemoryType | string;
  visibility?: "private";
};

export type AgentMemoryDraft = {
  confidence: number;
  content: string;
  id?: number;
  lastUsedAt: null | string;
  sourceRun?: AgentMemoryRelation;
  sourceThread?: AgentMemoryRelation;
  status: AgentMemoryStatus;
  title: string;
  type: AgentMemoryType;
  visibility: "private";
};

export type AgentMemoryDocument = AgentMemoryDraft & {
  createdAt: string;
  id: number;
  updatedAt: string;
};

export type AgentMemoryWriteData = {
  confidence: number;
  content: string;
  lastUsedAt?: null | string;
  sourceRun?: null | number;
  sourceThread?: null | number;
  status: AgentMemoryStatus;
  title: string;
  type: AgentMemoryType;
  visibility: "private";
};

const memoryTypeValues = ["fact", "preference", "project_context", "workflow_rule", "writing_style"] as const;
const memoryStatusValues = ["active", "archived"] as const;
const memoryTypeAliasMap: Record<string, AgentMemoryType> = {
  fact: "fact",
  preference: "preference",
  project: "project_context",
  project_context: "project_context",
  rule: "workflow_rule",
  style: "writing_style",
  workflow_rule: "workflow_rule",
  writing_style: "writing_style",
  事实: "fact",
  偏好: "preference",
  喜好: "preference",
  项目: "project_context",
  项目上下文: "project_context",
  工作流: "workflow_rule",
  工作流规则: "workflow_rule",
  规则: "workflow_rule",
  写作: "writing_style",
  写作风格: "writing_style",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeWhitespace = (value: string) => value.trim().replace(/\s+/g, " ");

const getString = (value: unknown) => (typeof value === "string" ? normalizeWhitespace(value) : "");

const deriveMemoryTitle = (content: string) => {
  const normalized = normalizeWhitespace(content);

  return normalized.length <= 36 ? normalized : `${normalized.slice(0, 36).trimEnd()}...`;
};

const normalizeMemoryType = (value: unknown): AgentMemoryType | null => {
  const raw = getString(value);

  if (!raw) {
    return null;
  }

  if (memoryTypeValues.includes(raw as AgentMemoryType)) {
    return raw as AgentMemoryType;
  }

  return memoryTypeAliasMap[raw.toLowerCase()] ?? memoryTypeAliasMap[raw] ?? null;
};

const normalizeStatus = (value: unknown): AgentMemoryStatus =>
  memoryStatusValues.includes(value as AgentMemoryStatus) ? (value as AgentMemoryStatus) : "active";

const normalizeConfidence = (value: unknown) => {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0.7;

  if (!Number.isFinite(parsed)) {
    return 0.7;
  }

  return Math.max(0, Math.min(1, parsed));
};

const relationId = (value: AgentMemoryRelation | undefined) =>
  typeof value === "number" ? value : typeof value?.id === "number" ? value.id : null;

const normalizeSearch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[\s\-_/·，。！？、:：；;（）()《》「」]/g, "");

const scoreTextMatch = (candidate: string, query: string) => {
  const normalizedCandidate = normalizeSearch(candidate);
  const normalizedQuery = normalizeSearch(query);

  if (!normalizedCandidate || !normalizedQuery) {
    return 0;
  }

  if (normalizedCandidate === normalizedQuery) {
    return 100;
  }

  if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) {
    return 70;
  }

  const queryTokens = query
    .toLowerCase()
    .split(/[\s,，.。;；:：!?！？/\\_-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  const compactChunkScore = Array.from({ length: Math.max(0, normalizedQuery.length - 1) }, (_, index) =>
    normalizedQuery.slice(index, index + 2),
  ).reduce((score, token) => score + (normalizedCandidate.includes(token) ? 3 : 0), 0);

  return queryTokens.reduce((score, token) => score + (candidate.toLowerCase().includes(token) ? 12 : 0), compactChunkScore);
};

export const parseAgentMemoryInput = (value: unknown): null | AgentMemoryDraft => {
  if (!isRecord(value)) {
    return null;
  }

  const content = getString(value.content);

  if (!content) {
    return null;
  }

  const type = normalizeMemoryType(value.type) ?? "fact";
  const title = getString(value.title) || deriveMemoryTitle(content);
  const lastUsedAt = getString(value.lastUsedAt);

  return {
    confidence: normalizeConfidence(value.confidence),
    content,
    ...(typeof value.id === "number" && Number.isFinite(value.id) ? { id: value.id } : {}),
    lastUsedAt: lastUsedAt && !Number.isNaN(Date.parse(lastUsedAt)) ? lastUsedAt : null,
    sourceRun: relationId(value.sourceRun as AgentMemoryRelation) ?? null,
    sourceThread: relationId(value.sourceThread as AgentMemoryRelation) ?? null,
    status: normalizeStatus(value.status),
    title,
    type,
    visibility: "private",
  };
};

export const validateAgentMemoryData = (value: unknown): AgentMemoryWriteData => {
  const memory = parseAgentMemoryInput(value);

  if (!memory) {
    throw new Error("Agent memory validation failed: content is required.");
  }

  return {
    confidence: memory.confidence,
    content: memory.content,
    lastUsedAt: memory.lastUsedAt,
    sourceRun: relationId(memory.sourceRun),
    sourceThread: relationId(memory.sourceThread),
    status: memory.status,
    title: memory.title,
    type: memory.type,
    visibility: "private",
  };
};

export const scoreAgentMemoryRelevance = (memory: Pick<AgentMemoryDraft, "content" | "title" | "type">, query: string) =>
  scoreTextMatch(`${memory.title} ${memory.type} ${memory.content}`, query);

export const inferAgentMemoryType = (content: string): AgentMemoryType => {
  if (/(风格|语气|口吻|写作|文案)/.test(content)) {
    return "writing_style";
  }

  if (/(规则|流程|工作流|以后都|每次都|不要|必须|优先)/.test(content)) {
    return "workflow_rule";
  }

  if (/(项目|SunnyPanel|站点|产品|功能|代码库)/i.test(content)) {
    return "project_context";
  }

  if (/(偏好|喜欢|倾向|希望|记住|以后)/.test(content)) {
    return "preference";
  }

  return "fact";
};
