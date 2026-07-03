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
  "relatedArticle",
  "relatedChecklist",
  "relatedNow",
  "relatedPlan",
  "relatedTaskKey",
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

  for (const field of timelineSnapshotFields) {
    if (field in timelineEvent) {
      snapshot[field] = timelineEvent[field];
    }
  }

  return snapshot;
};

export const buildChecklistGroupsAndTimelineRollbackPayload = (
  documentId: number,
  groups: unknown,
  previousTimelineEvent: null | Record<string, unknown>,
  timelineEventId: null | number | undefined,
) => ({
  beforeSnapshot: {
    groups,
    timelineEvent: snapshotTimelineEvent(previousTimelineEvent),
  },
  strategy: "restore_checklist_groups_and_timeline",
  target: {
    collection: "checklists",
    documentId,
    ...(typeof timelineEventId === "number" ? { timelineEventId } : {}),
  },
});
