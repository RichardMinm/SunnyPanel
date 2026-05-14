export type TimelineComposerSourceType = "checklist_item" | "free_text" | "note" | "plan" | "post" | "update";
export type TimelineComposerEventType = "life" | "milestone" | "project";
export type TimelineComposerVisibility = "private" | "public";

export type ComposeTimelineEventArgs = {
  checklistTitle?: null | string;
  createEvent?: boolean;
  eventDate?: null | string;
  groupTitle?: null | string;
  isFeatured?: boolean;
  itemTitle?: null | string;
  relatedTaskKey?: null | string;
  sourceId?: null | number;
  sourceText?: null | string;
  sourceTitle?: null | string;
  sourceType?: null | TimelineComposerSourceType;
  type?: null | TimelineComposerEventType;
  visibility?: null | TimelineComposerVisibility;
};

export type TimelineEventProposal = {
  description: string;
  eventDate: string;
  isFeatured: boolean;
  reason: string;
  relatedContentLabel: string;
  relatedFields: {
    relatedChecklist?: number;
    relatedPost?: number;
    relatedTaskKey?: string;
    relatedUpdate?: number;
  };
  sourceType: TimelineComposerSourceType;
  status: "draft" | "published";
  title: string;
  type: TimelineComposerEventType;
  visibility: TimelineComposerVisibility;
};

const sourceTypeLabelMap: Record<TimelineComposerSourceType, string> = {
  checklist_item: "Checklist item",
  free_text: "Free text",
  note: "Note",
  plan: "Plan",
  post: "Post",
  update: "Update",
};

const normalizeText = (value: null | string | undefined) => value?.trim().replace(/\s+/g, " ") ?? "";

const compactText = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength).trimEnd()}...`;

const parseDate = (value?: null | string) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

export const isTimelineComposerSourceAmbiguous = (args: ComposeTimelineEventArgs) => {
  if (normalizeText(args.sourceText)) {
    return false;
  }

  if (args.sourceType === "checklist_item") {
    return !normalizeText(args.checklistTitle) || !normalizeText(args.itemTitle);
  }

  return !args.sourceId && !normalizeText(args.sourceTitle);
};

const inferSourceType = (args: ComposeTimelineEventArgs): TimelineComposerSourceType => {
  if (args.sourceType) {
    return args.sourceType;
  }

  if (normalizeText(args.checklistTitle) || normalizeText(args.itemTitle)) {
    return "checklist_item";
  }

  if (normalizeText(args.sourceText)) {
    return "free_text";
  }

  return "free_text";
};

const inferTitle = (args: ComposeTimelineEventArgs, sourceType: TimelineComposerSourceType) => {
  const explicitTitle = normalizeText(args.sourceTitle);

  if (sourceType === "checklist_item") {
    const checklistTitle = normalizeText(args.checklistTitle);
    const groupTitle = normalizeText(args.groupTitle);
    const itemTitle = normalizeText(args.itemTitle);
    const prefix = [checklistTitle, groupTitle].filter(Boolean).join(" · ");

    return compactText(prefix ? `${prefix} / ${itemTitle} 完成` : `${itemTitle} 完成`, 72);
  }

  if (explicitTitle) {
    return compactText(explicitTitle, 72);
  }

  const sourceText = normalizeText(args.sourceText);

  return compactText(sourceText || "新的时间线记忆", 72);
};

const inferDescription = (args: ComposeTimelineEventArgs, title: string, sourceType: TimelineComposerSourceType) => {
  const sourceText = normalizeText(args.sourceText);
  const sourceLabel = sourceTypeLabelMap[sourceType];

  if (sourceType === "checklist_item") {
    return compactText(
      sourceText || `${title}。这个节点记录了一项具体工作从待办进入完成状态，适合作为后续复盘的记忆锚点。`,
      260,
    );
  }

  if (sourceText) {
    return compactText(sourceText, 260);
  }

  return compactText(`${title}。由 ${sourceLabel} 转写为 Timeline 节点，用来保留这次变化对长期叙事的意义。`, 260);
};

const inferType = (args: ComposeTimelineEventArgs, sourceType: TimelineComposerSourceType, title: string): TimelineComposerEventType => {
  if (args.type) {
    return args.type;
  }

  if (/(发布|上线|完成|里程碑|第一版|v\d+)/i.test(title)) {
    return "milestone";
  }

  if (sourceType === "note" || sourceType === "free_text") {
    return "life";
  }

  return "project";
};

const inferFeatured = (args: ComposeTimelineEventArgs, title: string, visibility: TimelineComposerVisibility) => {
  if (typeof args.isFeatured === "boolean") {
    return args.isFeatured;
  }

  return visibility === "public" && /(发布|上线|完成|里程碑|第一版|重要)/.test(title);
};

const buildRelatedFields = (args: ComposeTimelineEventArgs, sourceType: TimelineComposerSourceType) => {
  const sourceId = args.sourceId ?? undefined;

  if (!sourceId) {
    return {};
  }

  if (sourceType === "post") {
    return {
      relatedPost: sourceId,
    };
  }

  if (sourceType === "update") {
    return {
      relatedUpdate: sourceId,
    };
  }

  if (sourceType === "checklist_item") {
    return {
      relatedChecklist: sourceId,
      ...(args.relatedTaskKey ? { relatedTaskKey: args.relatedTaskKey } : {}),
    };
  }

  return {};
};

const buildRelatedLabel = (args: ComposeTimelineEventArgs, sourceType: TimelineComposerSourceType) => {
  const title = normalizeText(args.sourceTitle) || normalizeText(args.itemTitle) || normalizeText(args.sourceText);
  const label = sourceTypeLabelMap[sourceType];
  const id = args.sourceId ? ` #${args.sourceId}` : "";

  return title ? `${label}${id} · ${compactText(title, 56)}` : `${label}${id || " · 未指定来源 ID"}`;
};

const buildReason = (sourceType: TimelineComposerSourceType, visibility: TimelineComposerVisibility) => {
  const publicHint = visibility === "public" ? "它会成为公开记忆骨架的一部分，" : "它会先作为私有记忆节点沉淀，";

  if (sourceType === "checklist_item") {
    return `${publicHint}把完成动作从机械同步提升为可回看的成果节点。`;
  }

  if (sourceType === "plan") {
    return `${publicHint}把计划推进结果连接到长期叙事，而不只是停留在任务列表里。`;
  }

  if (sourceType === "free_text") {
    return `${publicHint}把一段松散记录整理成结构化 Timeline 记忆。`;
  }

  return `${publicHint}让这次内容变化在 Timeline 中形成可追踪的上下文。`;
};

export const composeTimelineEventProposal = (
  args: ComposeTimelineEventArgs,
  nowInput: Date | string = new Date(),
): null | TimelineEventProposal => {
  if (isTimelineComposerSourceAmbiguous(args)) {
    return null;
  }

  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const sourceType = inferSourceType(args);
  const visibility = args.visibility ?? "public";
  const title = inferTitle(args, sourceType);
  const eventDate = (parseDate(args.eventDate) ?? (Number.isNaN(now.getTime()) ? new Date() : now)).toISOString();
  const type = inferType(args, sourceType, title);
  const isFeatured = inferFeatured(args, title, visibility);

  return {
    description: inferDescription(args, title, sourceType),
    eventDate,
    isFeatured,
    reason: buildReason(sourceType, visibility),
    relatedContentLabel: buildRelatedLabel(args, sourceType),
    relatedFields: buildRelatedFields(args, sourceType),
    sourceType,
    status: visibility === "public" ? "published" : "draft",
    title,
    type,
    visibility,
  };
};

export const formatTimelineProposal = (proposal: TimelineEventProposal) =>
  [
    `Timeline title：${proposal.title}`,
    `Description：${proposal.description}`,
    `Related：${proposal.relatedContentLabel}`,
    `Visibility：${proposal.visibility}`,
    `Featured：${proposal.isFeatured ? "yes" : "no"}`,
    `Reason：${proposal.reason}`,
  ].join("\n");
