import type {
  ChecklistViewSummary,
  LinkedObjectSummary,
  PlanSummary,
  ScheduleViewSummary,
  TimelineViewSummary,
} from "./contracts";
import type { Where } from "payload";

type CoreLinkageCollection =
  | "checklists"
  | "plans"
  | "schedule-items"
  | "timeline-events";

type CoreLinkageDocument = Record<string, unknown> & { id?: unknown };

export type CoreLinkageReadPayload<TActor> = {
  find(args: {
    collection: CoreLinkageCollection;
    depth?: number;
    limit?: number;
    overrideAccess: false;
    pagination?: boolean;
    sort?: string;
    user: TActor;
    where?: Where;
  }): Promise<{
    docs: unknown[];
    totalDocs?: number;
  }>;
};

const LINKED_OBJECT_TITLE_MAX_LENGTH = 160;
const LINKED_OBJECT_STATUS_MAX_LENGTH = 64;

const typeOrder: Record<LinkedObjectSummary["type"], number> = {
  plan: 0,
  checklist: 1,
  schedule: 2,
  timeline: 3,
};

const asDocuments = (documents: unknown[]): CoreLinkageDocument[] =>
  documents.filter(
    (document): document is CoreLinkageDocument =>
      document !== null && typeof document === "object" && !Array.isArray(document),
  );

const asPersistedId = (value: unknown): number | null => {
  const candidate = value && typeof value === "object"
    ? (value as { id?: unknown }).id
    : value;

  return typeof candidate === "number"
    && Number.isInteger(candidate)
    && candidate > 0
    ? candidate
    : null;
};

const asDisplayTitle = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const title = value.trim().replace(/\s+/gu, " ");
  return title ? title.slice(0, LINKED_OBJECT_TITLE_MAX_LENGTH) : null;
};

const asStatus = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const status = value.trim();
  return status ? status.slice(0, LINKED_OBJECT_STATUS_MAX_LENGTH) : null;
};

const asDate = (value: unknown): string | null => {
  let candidate: string;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    candidate = value.toISOString().slice(0, 10);
  } else if (typeof value === "string") {
    const source = value.trim();
    const isExactDate = /^\d{4}-\d{2}-\d{2}$/u.test(source);
    const isCompleteTimestamp =
      /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/u.test(source)
      && Number.isFinite(Date.parse(source));
    if (!isExactDate && !isCompleteTimestamp) {
      return null;
    }
    candidate = source.slice(0, 10);
  } else {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(candidate);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (
    normalized.getUTCFullYear() !== year
    || normalized.getUTCMonth() !== month - 1
    || normalized.getUTCDate() !== day
  ) {
    return null;
  }

  return candidate;
};

const createLinkedObjectSummary = (
  type: LinkedObjectSummary["type"],
  document: CoreLinkageDocument,
): LinkedObjectSummary | null => {
  const id = asPersistedId(document.id);
  const title = asDisplayTitle(document.title);
  if (id === null || title === null) {
    return null;
  }

  if (type === "plan" || type === "checklist") {
    return { id, title, type };
  }

  const date = asDate(type === "schedule" ? document.date : document.eventDate);
  if (date === null) {
    return null;
  }

  return {
    date,
    id,
    status: asStatus(document.status),
    title,
    type,
  };
};

const dedupeAndOrderLinkedObjects = (
  summaries: Array<LinkedObjectSummary | null>,
): LinkedObjectSummary[] => {
  const seen = new Set<string>();
  return summaries
    .filter((summary): summary is LinkedObjectSummary => summary !== null)
    .filter((summary) => {
      const key = `${summary.type}:${summary.id}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((summary, serverIndex) => ({ serverIndex, summary }))
    .sort((left, right) =>
      typeOrder[left.summary.type] - typeOrder[right.summary.type]
      || left.serverIndex - right.serverIndex)
    .map(({ summary }) => summary);
};

const mapLinkedSummariesById = (
  type: LinkedObjectSummary["type"],
  documents: CoreLinkageDocument[],
) => {
  const summaries = new Map<number, LinkedObjectSummary>();
  for (const document of documents) {
    const summary = createLinkedObjectSummary(type, document);
    if (summary && !summaries.has(summary.id)) {
      summaries.set(summary.id, summary);
    }
  }
  return summaries;
};

const appendByRelation = (
  target: Map<number, LinkedObjectSummary[]>,
  relation: unknown,
  summary: LinkedObjectSummary | null,
) => {
  const relationId = asPersistedId(relation);
  if (relationId === null || summary === null) {
    return;
  }
  const entries = target.get(relationId) ?? [];
  entries.push(summary);
  target.set(relationId, entries);
};

const findRelated = async <TActor>(
  payload: CoreLinkageReadPayload<TActor>,
  actor: TActor,
  collection: CoreLinkageCollection,
  field: string,
  ids: Set<number>,
) => {
  if (ids.size === 0) {
    return [] as CoreLinkageDocument[];
  }
  const result = await payload.find({
    collection,
    depth: 0,
    limit: 200,
    overrideAccess: false,
    pagination: false,
    user: actor,
    where: { [field]: { in: Array.from(ids) } },
  });
  return asDocuments(result.docs);
};

const flattenChecklistItems = (groups: unknown) => {
  const items: Array<Record<string, unknown>> = [];
  if (!Array.isArray(groups)) {
    return items;
  }
  for (const group of groups) {
    if (!group || typeof group !== "object") {
      continue;
    }
    const groupItems = (group as { items?: unknown }).items;
    if (!Array.isArray(groupItems)) {
      continue;
    }
    for (const item of groupItems) {
      if (item && typeof item === "object" && typeof (item as { title?: unknown }).title === "string") {
        items.push(item as Record<string, unknown>);
      }
    }
  }
  return items;
};

export const loadPlanSummaries = async <TActor>(
  payload: CoreLinkageReadPayload<TActor>,
  actor: TActor,
): Promise<PlanSummary[]> => {
  const planResult = await payload.find({
    collection: "plans",
    depth: 0,
    limit: 10,
    overrideAccess: false,
    sort: "-updatedAt",
    user: actor,
  });
  const plans = asDocuments(planResult.docs);
  const planIds = new Set(
    plans
      .map((plan) => asPersistedId(plan.id))
      .filter((id): id is number => id !== null),
  );
  const [checklists, scheduleItems, timelineEvents] = await Promise.all([
    findRelated(payload, actor, "checklists", "planId", planIds),
    findRelated(payload, actor, "schedule-items", "relatedPlan", planIds),
    findRelated(payload, actor, "timeline-events", "relatedPlan", planIds),
  ]);

  const checklistsByPlanId = new Map<number, Array<{
    completedItems: number;
    id: number;
    title: string;
    totalItems: number;
  }>>();
  const checklistLinksByPlanId = new Map<number, LinkedObjectSummary[]>();
  for (const checklist of checklists) {
    const planId = asPersistedId(checklist.planId);
    const checklistId = asPersistedId(checklist.id);
    const title = asDisplayTitle(checklist.title);
    if (planId !== null && checklistId !== null && title !== null) {
      const items = flattenChecklistItems(checklist.groups);
      const entry = {
        completedItems: items.filter((item) => Boolean(item.isCompleted)).length,
        id: checklistId,
        title,
        totalItems: items.length,
      };
      checklistsByPlanId.set(planId, [...(checklistsByPlanId.get(planId) ?? []), entry]);
    }
    appendByRelation(
      checklistLinksByPlanId,
      checklist.planId,
      createLinkedObjectSummary("checklist", checklist),
    );
  }

  const schedulesByPlanId = new Map<number, Array<{
    endsAt: string | null;
    id: number;
    startsAt: string | null;
    status: string | null;
    title: string;
  }>>();
  const scheduleLinksByPlanId = new Map<number, LinkedObjectSummary[]>();
  for (const scheduleItem of scheduleItems) {
    const planId = asPersistedId(scheduleItem.relatedPlan);
    const scheduleId = asPersistedId(scheduleItem.id);
    const title = asDisplayTitle(scheduleItem.title);
    if (planId !== null && scheduleId !== null && title !== null) {
      schedulesByPlanId.set(planId, [
        ...(schedulesByPlanId.get(planId) ?? []),
        {
          endsAt: typeof scheduleItem.endTime === "string" ? scheduleItem.endTime : null,
          id: scheduleId,
          startsAt: typeof scheduleItem.startTime === "string" ? scheduleItem.startTime : null,
          status: asStatus(scheduleItem.status),
          title,
        },
      ]);
    }
    appendByRelation(
      scheduleLinksByPlanId,
      scheduleItem.relatedPlan,
      createLinkedObjectSummary("schedule", scheduleItem),
    );
  }

  const timelineLinksByPlanId = new Map<number, LinkedObjectSummary[]>();
  for (const timelineEvent of timelineEvents) {
    appendByRelation(
      timelineLinksByPlanId,
      timelineEvent.relatedPlan,
      createLinkedObjectSummary("timeline", timelineEvent),
    );
  }

  return plans.map((plan) => {
    const id = asPersistedId(plan.id) ?? Number(plan.id);
    return {
      agentState: typeof plan.agentState === "string" ? plan.agentState : null,
      checklists: checklistsByPlanId.get(id) ?? [],
      createdAt: typeof plan.createdAt === "string" ? plan.createdAt : null,
      id,
      linkedObjects: dedupeAndOrderLinkedObjects([
        ...(checklistLinksByPlanId.get(id) ?? []),
        ...(scheduleLinksByPlanId.get(id) ?? []),
        ...(timelineLinksByPlanId.get(id) ?? []),
      ]),
      progress: typeof plan.progress === "number" ? plan.progress : null,
      scheduleItems: schedulesByPlanId.get(id) ?? [],
      state: typeof plan.state === "string" ? plan.state : null,
      status: typeof plan.status === "string" ? plan.status : null,
      title: typeof plan.title === "string" ? plan.title : "",
      updatedAt: typeof plan.updatedAt === "string" ? plan.updatedAt : null,
    };
  });
};

export const loadChecklistSummaries = async <TActor>(
  payload: CoreLinkageReadPayload<TActor>,
  actor: TActor,
  options: { filterStatus: string; limit: number },
): Promise<ChecklistViewSummary[]> => {
  const result = await payload.find({
    collection: "checklists",
    depth: 1,
    limit: options.limit,
    overrideAccess: false,
    sort: "-updatedAt",
    user: actor,
    where: { status: { equals: "published" } },
  });
  const checklists = asDocuments(result.docs);
  const checklistIds = new Set(
    checklists
      .map((checklist) => asPersistedId(checklist.id))
      .filter((id): id is number => id !== null),
  );
  const planIds = new Set(
    checklists
      .map((checklist) => asPersistedId(checklist.planId))
      .filter((id): id is number => id !== null),
  );

  const [planResult, scheduleItems, timelineEvents] = await Promise.all([
    planIds.size === 0
      ? Promise.resolve({ docs: [] as unknown[] })
      : payload.find({
        collection: "plans",
        depth: 0,
        limit: planIds.size,
        overrideAccess: false,
        pagination: false,
        user: actor,
        where: { id: { in: Array.from(planIds) } },
      }),
    findRelated(payload, actor, "schedule-items", "relatedChecklist", checklistIds),
    findRelated(payload, actor, "timeline-events", "relatedChecklist", checklistIds),
  ]);
  const plansById = mapLinkedSummariesById("plan", asDocuments(planResult.docs));
  const scheduleLinksByChecklistId = new Map<number, LinkedObjectSummary[]>();
  for (const scheduleItem of scheduleItems) {
    appendByRelation(
      scheduleLinksByChecklistId,
      scheduleItem.relatedChecklist,
      createLinkedObjectSummary("schedule", scheduleItem),
    );
  }
  const timelineLinksByChecklistId = new Map<number, LinkedObjectSummary[]>();
  for (const timelineEvent of timelineEvents) {
    appendByRelation(
      timelineLinksByChecklistId,
      timelineEvent.relatedChecklist,
      createLinkedObjectSummary("timeline", timelineEvent),
    );
  }

  return checklists
    .map((checklist): ChecklistViewSummary => {
      const id = asPersistedId(checklist.id) ?? Number(checklist.id);
      const planId = asPersistedId(checklist.planId);
      const planSummary = planId === null ? undefined : plansById.get(planId);
      const items = flattenChecklistItems(checklist.groups);
      const completedItems = items.filter((item) => Boolean(item.isCompleted)).length;
      const status = items.length > 0 && completedItems === items.length ? "done" : "active";
      const relatedPlan = planSummary?.type === "plan"
        ? { id: planSummary.id, title: planSummary.title }
        : null;

      return {
        completedItems,
        id,
        items: items.map((item) => ({
          completed: Boolean(item.isCompleted),
          key: typeof item.id === "string"
            ? item.id
            : typeof item.title === "string"
              ? item.title
              : "",
          label: typeof item.title === "string" ? item.title : "",
        })),
        linkedObjects: dedupeAndOrderLinkedObjects([
          planSummary ?? null,
          ...(scheduleLinksByChecklistId.get(id) ?? []),
          ...(timelineLinksByChecklistId.get(id) ?? []),
        ]),
        relatedPlan,
        status,
        title: typeof checklist.title === "string" ? checklist.title : "",
        totalItems: items.length,
      };
    })
    .filter((checklist) => !options.filterStatus || checklist.status === options.filterStatus);
};

export const loadScheduleSummaries = async <TActor>(
  payload: CoreLinkageReadPayload<TActor>,
  actor: TActor,
  options: { monthEnd: string; monthStart: string },
): Promise<ScheduleViewSummary[]> => {
  const result = await payload.find({
    collection: "schedule-items",
    depth: 1,
    limit: 200,
    overrideAccess: false,
    sort: "date",
    user: actor,
    where: {
      and: [
        { date: { greater_than_equal: options.monthStart } },
        { date: { less_than_equal: options.monthEnd } },
      ],
    },
  });
  const schedules = asDocuments(result.docs);
  const scheduleIds = new Set(
    schedules
      .map((schedule) => asPersistedId(schedule.id))
      .filter((id): id is number => id !== null),
  );
  const planIds = new Set(
    schedules
      .map((schedule) => asPersistedId(schedule.relatedPlan))
      .filter((id): id is number => id !== null),
  );
  const checklistIds = new Set(
    schedules
      .map((schedule) => asPersistedId(schedule.relatedChecklist))
      .filter((id): id is number => id !== null),
  );
  const [planResult, checklistResult, timelineEvents] = await Promise.all([
    planIds.size === 0
      ? Promise.resolve({ docs: [] as unknown[] })
      : payload.find({
        collection: "plans",
        depth: 0,
        limit: planIds.size,
        overrideAccess: false,
        pagination: false,
        user: actor,
        where: { id: { in: Array.from(planIds) } },
      }),
    checklistIds.size === 0
      ? Promise.resolve({ docs: [] as unknown[] })
      : payload.find({
        collection: "checklists",
        depth: 0,
        limit: checklistIds.size,
        overrideAccess: false,
        pagination: false,
        user: actor,
        where: { id: { in: Array.from(checklistIds) } },
      }),
    findRelated(payload, actor, "timeline-events", "relatedScheduleItem", scheduleIds),
  ]);
  const plansById = mapLinkedSummariesById("plan", asDocuments(planResult.docs));
  const checklistsById = mapLinkedSummariesById("checklist", asDocuments(checklistResult.docs));
  const timelineLinksByScheduleId = new Map<number, LinkedObjectSummary[]>();
  for (const timelineEvent of timelineEvents) {
    appendByRelation(
      timelineLinksByScheduleId,
      timelineEvent.relatedScheduleItem,
      createLinkedObjectSummary("timeline", timelineEvent),
    );
  }

  return schedules.map((schedule): ScheduleViewSummary => {
    const id = asPersistedId(schedule.id) ?? Number(schedule.id);
    const planId = asPersistedId(schedule.relatedPlan);
    const checklistId = asPersistedId(schedule.relatedChecklist);
    const planSummary = planId === null ? undefined : plansById.get(planId);
    const checklistSummary = checklistId === null ? undefined : checklistsById.get(checklistId);
    return {
      category: typeof schedule.category === "string" ? schedule.category : null,
      conflictNote: typeof schedule.conflictNote === "string" ? schedule.conflictNote : null,
      date: asDate(schedule.date) ?? "",
      description: typeof schedule.description === "string" ? schedule.description : null,
      endTime: typeof schedule.endTime === "string" ? schedule.endTime : null,
      id,
      linkedObjects: dedupeAndOrderLinkedObjects([
        planSummary ?? null,
        checklistSummary ?? null,
        ...(timelineLinksByScheduleId.get(id) ?? []),
      ]),
      planId,
      priority: typeof schedule.priority === "string" ? schedule.priority : "medium",
      relatedChecklist: checklistSummary?.type === "checklist"
        ? { id: checklistSummary.id, title: checklistSummary.title }
        : null,
      relatedChecklistItemKey: typeof schedule.relatedChecklistItemKey === "string"
        ? schedule.relatedChecklistItemKey
        : null,
      relatedPlan: planSummary?.type === "plan"
        ? { id: planSummary.id, title: planSummary.title }
        : null,
      sourceType: typeof schedule.sourceType === "string" ? schedule.sourceType : "manual",
      startTime: typeof schedule.startTime === "string" ? schedule.startTime : null,
      status: asStatus(schedule.status),
      title: typeof schedule.title === "string" ? schedule.title : "",
    };
  });
};

export const loadTimelineSummaries = async <TActor>(
  payload: CoreLinkageReadPayload<TActor>,
  actor: TActor,
  options: { limit: number; monthEnd: string; monthStart: string },
): Promise<TimelineViewSummary[]> => {
  const result = await payload.find({
    collection: "timeline-events",
    depth: 0,
    limit: options.limit,
    overrideAccess: false,
    sort: "-eventDate",
    user: actor,
    where: {
      and: [
        { eventDate: { greater_than_equal: options.monthStart } },
        { eventDate: { less_than_equal: options.monthEnd } },
      ],
    },
  });
  const events = asDocuments(result.docs);
  const planIds = new Set(
    events
      .map((event) => asPersistedId(event.relatedPlan))
      .filter((id): id is number => id !== null),
  );
  const checklistIds = new Set(
    events
      .map((event) => asPersistedId(event.relatedChecklist))
      .filter((id): id is number => id !== null),
  );
  const scheduleIds = new Set(
    events
      .map((event) => asPersistedId(event.relatedScheduleItem))
      .filter((id): id is number => id !== null),
  );
  const [planResult, checklistResult, scheduleResult] = await Promise.all([
    planIds.size === 0
      ? Promise.resolve({ docs: [] as unknown[] })
      : payload.find({
        collection: "plans",
        depth: 0,
        limit: planIds.size,
        overrideAccess: false,
        pagination: false,
        user: actor,
        where: { id: { in: Array.from(planIds) } },
      }),
    checklistIds.size === 0
      ? Promise.resolve({ docs: [] as unknown[] })
      : payload.find({
        collection: "checklists",
        depth: 0,
        limit: checklistIds.size,
        overrideAccess: false,
        pagination: false,
        user: actor,
        where: { id: { in: Array.from(checklistIds) } },
      }),
    scheduleIds.size === 0
      ? Promise.resolve({ docs: [] as unknown[] })
      : payload.find({
        collection: "schedule-items",
        depth: 0,
        limit: scheduleIds.size,
        overrideAccess: false,
        pagination: false,
        user: actor,
        where: { id: { in: Array.from(scheduleIds) } },
      }),
  ]);
  const plansById = mapLinkedSummariesById("plan", asDocuments(planResult.docs));
  const checklistsById = mapLinkedSummariesById("checklist", asDocuments(checklistResult.docs));
  const schedulesById = mapLinkedSummariesById("schedule", asDocuments(scheduleResult.docs));

  return events.map((event): TimelineViewSummary => {
    const planId = asPersistedId(event.relatedPlan);
    const checklistId = asPersistedId(event.relatedChecklist);
    const scheduleId = asPersistedId(event.relatedScheduleItem);
    return {
      date: asDate(event.eventDate) ?? "",
      description: typeof event.description === "string" ? event.description : null,
      id: asPersistedId(event.id) ?? Number(event.id),
      linkedObjects: dedupeAndOrderLinkedObjects([
        planId === null ? null : (plansById.get(planId) ?? null),
        checklistId === null ? null : (checklistsById.get(checklistId) ?? null),
        scheduleId === null ? null : (schedulesById.get(scheduleId) ?? null),
      ]),
      sourceType: typeof event.sourceType === "string" ? event.sourceType : null,
      title: typeof event.title === "string" ? event.title : "",
      type: typeof event.type === "string" ? event.type : "",
    };
  });
};
