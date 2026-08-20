import type { AgentRun, Checklist } from "@/payload-types";

import { getPayloadClient } from "@/lib/payload/client";

import { getCurrentAgentUserId } from "./execution-context";
import {
  buildChecklistTimelineDescription,
  buildChecklistTimelineTitle,
} from "./checklist-timeline-semantics";
import type {
  AgentTraceStep,
  ComposeTimelineEventArgs,
  PendingAction,
} from "./schemas";
import { validateAgentRunData } from "./write-schemas";
import type { SafeExecutionFailureCode } from "./orchestration/safe-execution-failure";

export {
  sanitizeAffectedDocuments,
  type AffectedDocumentSummary,
} from "./affected-documents";
import type { AffectedDocumentSummary } from "./affected-documents";

export type ChecklistGroup = NonNullable<Checklist["groups"]>[number];
export type ChecklistItem = NonNullable<ChecklistGroup["items"]>[number];

export type AgentToolResult = {
  affectedDocuments?: AffectedDocumentSummary[];
  assistantMessage: string;
  pendingAction: null | PendingAction;
  createdPlanId?: number;
  errorCode?: SafeExecutionFailureCode;
  planId?: number;
  rollbackPayload?: unknown;
  rollbackSourceRunId?: number;
  status?: "completed" | "failed";
};

export type AgentOwnedRollbackToolResult = AgentToolResult & {
  rollbackPayload: unknown;
  rollbackSourceRunId: number;
  status?: "completed";
};

/**
 * Compile-time construction boundary for successful rollbackable tool
 * receipts. Failed after-commit receipts use their separate internal marker.
 */
export const createOwnedRollbackToolResult = <
  const TResult extends AgentOwnedRollbackToolResult,
>(
  result: TResult,
): TResult => result;

export type AgentExecutionTraceReporter = (step: AgentTraceStep) => void;

export const normalizeForSearch = (value: string) =>
  value.toLowerCase().replace(/[\s\-_/·，。！？、:：；;（）()]/g, "");

export const scoreTextMatch = (candidate: string, query: string) => {
  const normalizedCandidate = normalizeForSearch(candidate);
  const normalizedQuery = normalizeForSearch(query);

  if (!normalizedCandidate || !normalizedQuery) {
    return 0;
  }

  if (normalizedCandidate === normalizedQuery) {
    return 100;
  }

  if (normalizedCandidate.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedCandidate)) {
    return 80;
  }

  if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) {
    return 60;
  }

  return 0;
};

export const buildChecklistItemLabel = (
  checklistTitle: string,
  groupTitle: null | string | undefined,
  itemTitle: string,
) => (groupTitle ? `「${checklistTitle} / ${groupTitle} / ${itemTitle}」` : `「${checklistTitle} / ${itemTitle}」`);

export const buildTimelineTitle = (
  checklistTitle: string,
  groupTitle: null | string | undefined,
  itemTitle: string,
) => buildChecklistTimelineTitle({ checklistTitle, groupTitle, itemTitle });

export const buildTimelineDescription = (
  checklistTitle: string,
  groupTitle: null | string | undefined,
  item: ChecklistItem,
) =>
  buildChecklistTimelineDescription({
    checklistTitle,
    completionNote: item.completionNote,
    groupTitle,
    itemDescription: item.description,
    itemTitle: item.title,
  });

export const createAgentRun = async ({
  affectedDocuments,
  afterSnapshot,
  agentRole,
  beforeSnapshot,
  goal,
  nextAction,
  orchestrationId,
  payload: payloadOverride,
  relatedContent,
  relatedPlan,
  rollbackAvailable,
  rollbackPayload,
  status,
  steps,
  summary,
  title,
  userId,
  workflow,
}: {
  affectedDocuments?: unknown;
  afterSnapshot?: unknown;
  agentRole?: NonNullable<AgentRun["agentRole"]>;
  beforeSnapshot?: unknown;
  goal?: null | string;
  nextAction?: null | string;
  orchestrationId?: string;
  payload?: Pick<Awaited<ReturnType<typeof getPayloadClient>>, "create">;
  relatedContent?: NonNullable<AgentRun["relatedContent"]>;
  relatedPlan?: number;
  rollbackAvailable?: boolean;
  rollbackPayload?: unknown;
  status: NonNullable<AgentRun["status"]>;
  steps: Array<{
    level: "error" | "info" | "warn";
    message: string;
  }>;
  summary: string;
  title: string;
  userId?: number;
  workflow: NonNullable<AgentRun["workflow"]>;
}) => {
  const payload = payloadOverride ?? (await getPayloadClient());
  const startedAt = new Date().toISOString();
  const runUserId = userId ?? getCurrentAgentUserId();
  const data = validateAgentRunData({
    affectedDocuments,
    afterSnapshot,
    agentRole,
    beforeSnapshot,
    completedAt: startedAt,
    goal: goal ?? summary,
    nextAction,
    orchestrationId,
    relatedContent,
    relatedPlan,
    rollbackAvailable,
    rollbackPayload,
    startedAt,
    status,
    steps: steps.map((step) => ({
      level: step.level,
      message: step.message,
      recordedAt: startedAt,
    })),
    summary,
    title,
    trigger: "agent",
    user: runUserId,
    workflow,
  });

  return payload.create({
    collection: "agent-runs",
    context: {
      skipAgentRunPlanSync: true,
    },
    data,
    overrideAccess: true,
  });
};

export const createClarifyResult = (assistantMessage: string): AgentToolResult => ({
  assistantMessage,
  pendingAction: null,
});

export const getTimelineComposerRelatedContent = (
  args: ComposeTimelineEventArgs,
  timelineEventId: number,
): NonNullable<AgentRun["relatedContent"]> => {
  const relatedContent: NonNullable<AgentRun["relatedContent"]> = [
    {
      relationTo: "timeline-events",
      value: timelineEventId,
    },
  ];

  if (!args.sourceId) {
    return relatedContent;
  }

  if (args.sourceType === "post") {
    relatedContent.push({
      relationTo: "posts",
      value: args.sourceId,
    });
  }

  if (args.sourceType === "note") {
    relatedContent.push({
      relationTo: "notes",
      value: args.sourceId,
    });
  }

  if (args.sourceType === "update") {
    relatedContent.push({
      relationTo: "updates",
      value: args.sourceId,
    });
  }

  if (args.sourceType === "checklist_item") {
    relatedContent.push({
      relationTo: "checklists",
      value: args.sourceId,
    });
  }

  return relatedContent;
};
