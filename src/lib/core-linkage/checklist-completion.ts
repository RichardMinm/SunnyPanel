import type { Checklist, TimelineEvent } from "@/payload-types";

import {
  buildChecklistTimelineDescription,
  buildChecklistTimelineTitle,
  CHECKLIST_TIMELINE_SOURCE_TYPE,
  CHECKLIST_TIMELINE_TYPE,
} from "@/lib/agent/checklist-timeline-semantics";
import {
  validateChecklistGroupsData,
  validateTimelineEventData,
} from "@/lib/agent/write-schemas";

import { buildChecklistItemReferenceKey } from "./checklist-item-key";
import {
  linkTimelineToPlan,
  resolveChecklistPlanId,
  type CoreLinkageFailureCode,
  type CoreLinkagePayload,
} from "./service";

if (typeof window !== "undefined") {
  throw new Error("The Checklist completion linkage service is server-only.");
}

type ChecklistCompletionCollection = "checklists" | "plans" | "timeline-events";

type ChecklistCompletionFindByIDArgs = {
  collection: ChecklistCompletionCollection;
  depth: 0;
  id: number;
  overrideAccess: boolean;
};

type ChecklistCompletionFindArgs = {
  collection: "timeline-events";
  depth: 0;
  limit: number;
  overrideAccess: boolean;
  pagination: false;
  where: unknown;
};

type ChecklistCompletionUpdateArgs = {
  collection: ChecklistCompletionCollection;
  context?: Record<string, unknown>;
  data: Record<string, unknown>;
  depth?: 0;
  id: number;
  overrideAccess: boolean;
};

type ChecklistCompletionCreateArgs = {
  collection: "timeline-events";
  data: Record<string, unknown>;
  overrideAccess: boolean;
};

type ChecklistCompletionDeleteArgs = {
  collection: "timeline-events";
  id: number;
  overrideAccess: boolean;
};

export type ChecklistCompletionPayload = {
  create: (args: ChecklistCompletionCreateArgs) => Promise<unknown>;
  delete: (args: ChecklistCompletionDeleteArgs) => Promise<unknown>;
  find: (args: ChecklistCompletionFindArgs) => Promise<{ docs: unknown[]; totalDocs: number }>;
  findByID: (args: ChecklistCompletionFindByIDArgs) => Promise<null | unknown>;
  update: (args: ChecklistCompletionUpdateArgs) => Promise<unknown>;
};

type ChecklistCompletionFailureCode =
  | CoreLinkageFailureCode
  | "ambiguous_item_reference"
  | "checklist_write_failed"
  | "item_not_found"
  | "timeline_write_failed";

type ChecklistCompletionAffectedDocument = {
  collection: "checklists" | "plans" | "timeline-events";
  documentId: number;
  operation: "create" | "update";
  visibility: "private" | "public" | "unknown";
};

type ChecklistCompletionFailure = {
  code: ChecklistCompletionFailureCode;
  ok: false;
  safeMessage: string;
};

type ChecklistCompletionSuccess = {
  affectedDocuments: ChecklistCompletionAffectedDocument[];
  beforeGroups: NonNullable<Checklist["groups"]>;
  changed: boolean;
  checklist: Checklist;
  itemKey: string;
  ok: true;
  planId: number | null;
  planLinkChanged: boolean;
  planLinkedContent: unknown;
  previousTimelineEvent: null | TimelineEvent;
  timelineEvent: TimelineEvent;
  timelineOperation: "create" | "update";
};

export type ChecklistItemCompletionResult =
  | ChecklistCompletionFailure
  | ChecklistCompletionSuccess;

const failureMessages: Record<ChecklistCompletionFailureCode, string> = {
  ambiguous_item_reference: "The Checklist item reference is not unique.",
  checklist_write_failed: "The Checklist item could not be completed safely.",
  compensation_failed: "The completion outcome could not be reconciled safely.",
  invalid_reference: "The related resource reference is invalid.",
  item_not_found: "The exact Checklist item reference was not found.",
  plan_link_invalid: "The Plan link state is invalid.",
  plan_link_write_failed: "The Plan link could not be updated.",
  resource_not_authorized: "The related resource is not available to this operation.",
  resource_not_found: "The related resource was not found.",
  timeline_write_failed: "The completion Timeline event could not be updated.",
};

const fail = (code: ChecklistCompletionFailureCode): ChecklistCompletionFailure => ({
  code,
  ok: false,
  safeMessage: failureMessages[code],
});

const isCompletionFailure = (value: unknown): value is ChecklistCompletionFailure =>
  Boolean(
    value &&
    typeof value === "object" &&
    "ok" in value &&
    (value as { ok?: unknown }).ok === false,
  );

const isPersistedId = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isChecklist = (value: unknown): value is Checklist =>
  Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    isPersistedId((value as { id?: unknown }).id) &&
    typeof (value as { title?: unknown }).title === "string",
  );

const isTimelineEvent = (value: unknown): value is TimelineEvent =>
  Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    isPersistedId((value as { id?: unknown }).id),
  );

const relationshipId = (value: unknown): number | null => {
  const id = typeof value === "number"
    ? value
    : value && typeof value === "object" && !Array.isArray(value)
      ? (value as { id?: unknown }).id
      : null;

  return isPersistedId(id) ? id : null;
};

const cloneGroups = (groups: Checklist["groups"]) =>
  (groups ?? []).map((group) => ({
    ...group,
    items: (group.items ?? []).map((item) => ({ ...item })),
  }));

const findExactItem = (checklist: Checklist, itemKey: string) => {
  const matches = (checklist.groups ?? []).flatMap((group, groupIndex) =>
    (group.items ?? []).flatMap((item, itemIndex) => {
      const canonicalKey = buildChecklistItemReferenceKey({
        groupIndex,
        itemIndex,
        title: item.title,
      });
      const embeddedId = typeof item.id === "string" && item.id.length > 0
        ? item.id
        : null;

      return itemKey === embeddedId || itemKey === canonicalKey
        ? [{
            canonicalKey,
            group,
            groupIndex,
            item,
            itemIndex,
            persistedKey: embeddedId ?? canonicalKey,
          }]
        : [];
    }),
  );

  if (matches.length === 0) {
    return fail("item_not_found");
  }

  if (matches.length > 1) {
    return fail("ambiguous_item_reference");
  }

  return matches[0]!;
};

const findTimelineEvent = async (
  payload: ChecklistCompletionPayload,
  checklistId: number,
  itemKey: string,
): Promise<ChecklistCompletionFailure | null | TimelineEvent> => {
  try {
    const result = await payload.find({
      collection: "timeline-events",
      depth: 0,
      limit: 2,
      overrideAccess: true,
      pagination: false,
      where: {
        and: [
          { relatedChecklist: { equals: checklistId } },
          { relatedTaskKey: { equals: itemKey } },
        ],
      },
    });

    if (result.totalDocs > 1 || result.docs.length > 1) {
      return fail("ambiguous_item_reference");
    }

    const event = result.docs[0];
    return event == null
      ? null
      : isTimelineEvent(event)
        ? event
        : fail("timeline_write_failed");
  } catch {
    return fail("resource_not_found");
  }
};

const timelineSnapshotData = (event: TimelineEvent): Record<string, unknown> => {
  const fields = [
    "description",
    "eventDate",
    "isFeatured",
    "sortOrder",
    "sourceType",
    "status",
    "title",
    "type",
    "visibility",
  ] as const;

  return {
    ...Object.fromEntries(
      fields.flatMap((field) => field in event ? [[field, event[field]]] : []),
    ),
    relatedChecklist: relationshipId(event.relatedChecklist),
    relatedPlan: relationshipId(event.relatedPlan),
    relatedPost: relationshipId(event.relatedPost),
    relatedScheduleItem: relationshipId(event.relatedScheduleItem),
    relatedTaskKey: typeof event.relatedTaskKey === "string" ? event.relatedTaskKey : null,
    relatedUpdate: relationshipId(event.relatedUpdate),
  };
};

const compensateCompletion = async (input: {
  beforeGroups: NonNullable<Checklist["groups"]>;
  checklistId: number;
  payload: ChecklistCompletionPayload;
  previousTimelineEvent: null | TimelineEvent;
  timelineEventId: number;
}) => {
  let failed = false;

  try {
    if (input.previousTimelineEvent) {
      await input.payload.update({
        collection: "timeline-events",
        data: timelineSnapshotData(input.previousTimelineEvent),
        id: input.previousTimelineEvent.id,
        overrideAccess: true,
      });
    } else {
      await input.payload.delete({
        collection: "timeline-events",
        id: input.timelineEventId,
        overrideAccess: true,
      });
    }
  } catch {
    failed = true;
  }

  try {
    await input.payload.update({
      collection: "checklists",
      context: { skipChecklistTimelineSync: true },
      data: { groups: input.beforeGroups },
      id: input.checklistId,
      overrideAccess: true,
    });
  } catch {
    failed = true;
  }

  return !failed;
};

export async function completeChecklistItemByKey(input: {
  checklistId: number;
  completedAt: string;
  completionNote?: null | string;
  itemKey: string;
  payload: ChecklistCompletionPayload;
}): Promise<ChecklistItemCompletionResult> {
  if (
    !isPersistedId(input.checklistId) ||
    typeof input.itemKey !== "string" ||
    input.itemKey.length === 0 ||
    typeof input.completedAt !== "string" ||
    input.completedAt.length === 0 ||
    (input.completionNote != null && typeof input.completionNote !== "string")
  ) {
    return fail("invalid_reference");
  }

  let checklist: Checklist;
  try {
    const exactChecklist = await input.payload.findByID({
      collection: "checklists",
      depth: 0,
      id: input.checklistId,
      overrideAccess: true,
    });
    if (!isChecklist(exactChecklist) || exactChecklist.id !== input.checklistId) {
      return fail("resource_not_found");
    }
    checklist = exactChecklist;
  } catch {
    return fail("resource_not_found");
  }

  const match = findExactItem(checklist, input.itemKey);
  if (isCompletionFailure(match)) {
    return match;
  }

  const planResolution = await resolveChecklistPlanId({
    checklistId: checklist.id,
    payload: input.payload as unknown as CoreLinkagePayload,
  });
  if (!planResolution.ok) {
    return planResolution;
  }

  const previousTimelineEvent = await findTimelineEvent(
    input.payload,
    checklist.id,
    match.persistedKey,
  );
  if (isCompletionFailure(previousTimelineEvent)) {
    return previousTimelineEvent;
  }

  const beforeGroups = cloneGroups(checklist.groups);
  const groups = cloneGroups(checklist.groups);
  groups[match.groupIndex]!.items![match.itemIndex] = {
    ...groups[match.groupIndex]!.items![match.itemIndex]!,
    completedAt: input.completedAt,
    completionNote: input.completionNote ?? match.item.completionNote ?? null,
    isCompleted: true,
  };

  let updatedChecklist: Checklist;
  try {
    const updated = await input.payload.update({
      collection: "checklists",
      context: { skipChecklistTimelineSync: true },
      data: { groups: validateChecklistGroupsData(groups) },
      id: checklist.id,
      overrideAccess: true,
    });
    if (!isChecklist(updated) || updated.id !== checklist.id) {
      return fail("checklist_write_failed");
    }
    updatedChecklist = updated;
  } catch {
    return fail("checklist_write_failed");
  }

  const updatedGroup = updatedChecklist.groups?.[match.groupIndex];
  const updatedItem = updatedGroup?.items?.[match.itemIndex];
  if (!updatedGroup || !updatedItem) {
    return fail("checklist_write_failed");
  }

  const timelineData = validateTimelineEventData({
    description: buildChecklistTimelineDescription({
      checklistTitle: updatedChecklist.title,
      completionNote: updatedItem.completionNote,
      groupTitle: updatedGroup.title,
      itemDescription: updatedItem.description,
      itemTitle: updatedItem.title,
    }),
    eventDate: updatedItem.completedAt ?? input.completedAt,
    isFeatured: false,
    relatedChecklist: updatedChecklist.id,
    relatedPlan: planResolution.planId,
    relatedPost: relationshipId(previousTimelineEvent?.relatedPost),
    relatedScheduleItem: relationshipId(previousTimelineEvent?.relatedScheduleItem),
    relatedTaskKey: match.persistedKey,
    relatedUpdate: relationshipId(previousTimelineEvent?.relatedUpdate),
    sortOrder: 0,
    sourceType: CHECKLIST_TIMELINE_SOURCE_TYPE,
    status: updatedChecklist.status,
    title: buildChecklistTimelineTitle({
      checklistTitle: updatedChecklist.title,
      groupTitle: updatedGroup.title,
      itemTitle: updatedItem.title,
    }),
    type: CHECKLIST_TIMELINE_TYPE,
    visibility: updatedChecklist.visibility,
  });

  let timelineEvent: TimelineEvent;
  const timelineOperation = previousTimelineEvent ? "update" as const : "create" as const;
  try {
    const written = previousTimelineEvent
      ? await input.payload.update({
          collection: "timeline-events",
          data: timelineData,
          id: previousTimelineEvent.id,
          overrideAccess: true,
        })
      : await input.payload.create({
          collection: "timeline-events",
          data: timelineData,
          overrideAccess: true,
        });

    if (!isTimelineEvent(written)) {
      return fail("timeline_write_failed");
    }
    timelineEvent = written;
  } catch {
    try {
      await input.payload.update({
        collection: "checklists",
        context: { skipChecklistTimelineSync: true },
        data: { groups: beforeGroups },
        id: checklist.id,
        overrideAccess: true,
      });
    } catch {
      return fail("compensation_failed");
    }
    return fail("timeline_write_failed");
  }

  let planLinkChanged = false;
  let planLinkedContent: unknown = null;

  if (planResolution.planId != null) {
    const planLink = await linkTimelineToPlan({
      payload: input.payload as unknown as CoreLinkagePayload,
      planId: planResolution.planId,
      timelineEventId: timelineEvent.id,
    });

    if (!planLink.ok) {
      const compensated = await compensateCompletion({
        beforeGroups,
        checklistId: checklist.id,
        payload: input.payload,
        previousTimelineEvent,
        timelineEventId: timelineEvent.id,
      });
      return compensated ? fail(planLink.code) : fail("compensation_failed");
    }

    planLinkChanged = planLink.changed;
    planLinkedContent = planLink.beforeLinkedContent;
  }

  const affectedDocuments: ChecklistCompletionAffectedDocument[] = [
    {
      collection: "checklists",
      documentId: updatedChecklist.id,
      operation: "update",
      visibility: updatedChecklist.visibility,
    },
    {
      collection: "timeline-events",
      documentId: timelineEvent.id,
      operation: timelineOperation,
      visibility: timelineEvent.visibility,
    },
  ];

  if (planResolution.planId != null) {
    affectedDocuments.push({
      collection: "plans",
      documentId: planResolution.planId,
      operation: "update",
      visibility: "unknown",
    });
  }

  return {
    affectedDocuments,
    beforeGroups,
    changed: true,
    checklist: updatedChecklist,
    itemKey: match.persistedKey,
    ok: true,
    planId: planResolution.planId,
    planLinkChanged,
    planLinkedContent,
    previousTimelineEvent,
    timelineEvent,
    timelineOperation,
  };
}
