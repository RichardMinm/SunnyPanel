export const buildChecklistGroupsRollbackPayload = (documentId: number, groups: unknown) => ({
  beforeSnapshot: {
    groups,
  },
  strategy: "restore_checklist_groups",
  target: {
    collection: "checklists",
    documentId,
  },
});

const timelineSnapshotFields = [
  "description",
  "eventDate",
  "id",
  "isFeatured",
  "relatedChecklist",
  "relatedPlan",
  "relatedPost",
  "relatedScheduleItem",
  "relatedTaskKey",
  "relatedUpdate",
  "sortOrder",
  "sourceType",
  "status",
  "title",
  "type",
  "visibility",
];

const snapshotTimelineEvent = (timelineEvent: null | Record<string, unknown>) => {
  if (!timelineEvent) {
    return null;
  }

  const snapshot: Record<string, unknown> = {};
  const nullableRelationFields = new Set([
    "relatedChecklist",
    "relatedPlan",
    "relatedPost",
    "relatedScheduleItem",
    "relatedTaskKey",
    "relatedUpdate",
  ]);

  for (const field of timelineSnapshotFields) {
    if (field in timelineEvent) {
      snapshot[field] = timelineEvent[field];
    } else if (nullableRelationFields.has(field)) {
      snapshot[field] = null;
    }
  }

  return snapshot;
};

export const buildChecklistGroupsAndTimelineRollbackPayload = (
  documentId: number,
  groups: unknown,
  previousTimelineEvent: null | Record<string, unknown>,
  timelineEventId: null | number | undefined,
  planLink?: {
    planId: null | number;
    planLinkChanged: boolean;
    planLinkedContent: unknown;
  },
) => ({
  beforeSnapshot: {
    groups,
    ...(planLink
      ? {
          planLinkChanged: planLink.planLinkChanged,
          planLinkedContent: planLink.planLinkedContent,
        }
      : {}),
    timelineEvent: snapshotTimelineEvent(previousTimelineEvent),
  },
  strategy: "restore_checklist_groups_and_timeline",
  target: {
    collection: "checklists",
    documentId,
    ...(typeof planLink?.planId === "number" ? { planId: planLink.planId } : {}),
    ...(typeof timelineEventId === "number" ? { timelineEventId } : {}),
  },
});
