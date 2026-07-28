import type { Checklist, TimelineEvent } from "@/payload-types";

import type { ScheduleRecordPatch } from "@/lib/agent/schemas";
import { buildChecklistGroupsAndTimelineRollbackPayload } from "@/lib/agent/tools/checklist-rollback";
import { completeChecklistItemByKey, type ChecklistCompletionPayload } from "@/lib/core-linkage/checklist-completion";
import { linkTimelineToPlan, type CoreLinkageActor, type CoreLinkagePayload } from "@/lib/core-linkage/service";

if (typeof window !== "undefined") {
  throw new Error("The Schedule completion service is server-only.");
}

type Collection = "checklists" | "plans" | "schedule-items" | "timeline-events";

type FindByIDArgs = { collection: Collection; depth: 0; id: number; overrideAccess: boolean };
type FindArgs = { collection: "timeline-events"; depth: 0; limit: number; overrideAccess: boolean; pagination: false; where: unknown };
type UpdateArgs = { collection: Collection; context?: Record<string, unknown>; data: Record<string, unknown>; depth?: 0; id?: number; overrideAccess: boolean; where?: unknown };

export type ScheduleCompletionPayload = {
  create: (args: { collection: "timeline-events"; data: Record<string, unknown>; overrideAccess: boolean }) => Promise<unknown>;
  delete: (args: { collection: "timeline-events"; id?: number; overrideAccess: boolean; where?: unknown }) => Promise<unknown>;
  find: (args: FindArgs) => Promise<{ docs: unknown[]; totalDocs: number }>;
  findByID: (args: FindByIDArgs) => Promise<unknown>;
  update: (args: UpdateArgs) => Promise<unknown>;
};

type ScheduleDocument = {
  [key: string]: unknown;
  id: number;
  status: "canceled" | "done" | "planned" | "skipped";
  title: string;
  relatedChecklist?: unknown;
  relatedChecklistItemKey?: unknown;
  relatedPlan?: unknown;
};

type FailureCode =
  | "ambiguous_schedule_timeline"
  | "checklist_completion_failed"
  | "invalid_actor"
  | "invalid_reference"
  | "resource_not_found"
  | "schedule_write_failed"
  | "timeline_write_failed"
  | "compensation_failed";

type Failure = { code: FailureCode; ok: false; safeMessage: string };
type AffectedDocument = { collection: Collection; documentId: number; operation: "create" | "update"; visibility: "private" | "public" | "unknown" };

export type ScheduleCompletionResult = Failure | {
  affectedDocuments: AffectedDocument[];
  changed: boolean;
  ok: true;
  rollbackPayload: {
    beforeSnapshot: { checklistCompletion?: ReturnType<typeof buildChecklistGroupsAndTimelineRollbackPayload>; checklistGroups: null | NonNullable<Checklist["groups"]>; schedule: Record<string, unknown>; schedulePlanLink?: { afterLinkedContent: unknown; beforeLinkedContent: unknown; changed: boolean; planId: number }; timelineEvent: null | Record<string, unknown> };
    strategy: "restore_schedule_completion";
    target: { checklistId: number | null; itemId: number; planId: number | null; timelineEventId: number };
  };
  schedule: ScheduleDocument;
  timelineEvent: TimelineEvent;
};

const messages: Record<FailureCode, string> = {
  ambiguous_schedule_timeline: "The Schedule completion Timeline record is not unique.",
  checklist_completion_failed: "The linked Checklist item could not be completed safely.",
  compensation_failed: "The Schedule completion outcome could not be reconciled safely.",
  invalid_actor: "The completion actor is not authorized.",
  invalid_reference: "The Schedule completion reference is invalid.",
  resource_not_found: "The related Schedule resource was not found.",
  schedule_write_failed: "The Schedule item could not be completed safely.",
  timeline_write_failed: "The Schedule completion Timeline event could not be updated.",
};

const fail = (code: FailureCode): Failure => ({ code, ok: false, safeMessage: messages[code] });
const isFailure = (value: unknown): value is Failure => Boolean(value && typeof value === "object" && (value as { ok?: unknown }).ok === false);
const isId = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;
const relationId = (value: unknown): number | null => isId(value) ? value : value && typeof value === "object" && isId((value as { id?: unknown }).id) ? (value as { id: number }).id : null;
const isActor = (actor: CoreLinkageActor): boolean => actor.isAdministrator === true && isId(actor.userId);
const isSchedule = (value: unknown): value is ScheduleDocument => Boolean(value && typeof value === "object" && isId((value as { id?: unknown }).id) && typeof (value as { title?: unknown }).title === "string" && typeof (value as { status?: unknown }).status === "string");
const isTimeline = (value: unknown): value is TimelineEvent => Boolean(value && typeof value === "object" && isId((value as { id?: unknown }).id));
const isChecklist = (value: unknown): value is Checklist => Boolean(value && typeof value === "object" && isId((value as { id?: unknown }).id) && typeof (value as { title?: unknown }).title === "string");

const snapshotSchedule = (schedule: ScheduleDocument) => Object.fromEntries(
  Object.entries(schedule).filter(([key]) => key !== "id" && key !== "createdAt" && key !== "updatedAt"),
);

const snapshotTimeline = (event: TimelineEvent): Record<string, unknown> => {
  const names = ["description", "eventDate", "isFeatured", "sortOrder", "sourceType", "status", "title", "type", "visibility"] as const;
  return {
    ...Object.fromEntries(names.flatMap((name) => name in event ? [[name, event[name]]] : [])),
    relatedChecklist: relationId(event.relatedChecklist),
    relatedPlan: relationId(event.relatedPlan),
    relatedPost: relationId(event.relatedPost),
    relatedScheduleItem: relationId(event.relatedScheduleItem),
    relatedTaskKey: typeof event.relatedTaskKey === "string" ? event.relatedTaskKey : null,
    relatedUpdate: relationId(event.relatedUpdate),
  };
};

const exactTimeline = async (payload: ScheduleCompletionPayload, itemId: number): Promise<Failure | null | TimelineEvent> => {
  try {
    const result = await payload.find({ collection: "timeline-events", depth: 0, limit: 2, overrideAccess: true, pagination: false, where: { relatedScheduleItem: { equals: itemId } } });
    if (result.totalDocs > 1 || result.docs.length > 1) return fail("ambiguous_schedule_timeline");
    return result.docs[0] == null ? null : isTimeline(result.docs[0]) ? result.docs[0] : fail("timeline_write_failed");
  } catch {
    return fail("resource_not_found");
  }
};

const readExact = async (payload: ScheduleCompletionPayload, collection: Collection, id: number): Promise<Failure | Record<string, unknown>> => {
  try {
    const document = await payload.findByID({ collection, depth: 0, id, overrideAccess: true });
    return document && typeof document === "object" && (document as { id?: unknown }).id === id ? document as Record<string, unknown> : fail("resource_not_found");
  } catch {
    return fail("resource_not_found");
  }
};

const checklistItemIsDone = (checklist: Checklist, key: string) => {
  const matches = (checklist.groups ?? []).flatMap((group) => (group.items ?? []).filter((item) => item.id === key));
  return matches.length === 1 && matches[0]?.isCompleted === true;
};

const sameData = (left: Record<string, unknown>, right: Record<string, unknown>) => {
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...names].every((name) => JSON.stringify(left[name]) === JSON.stringify(right[name]));
};

const planHasTimelineLink = (plan: Record<string, unknown> | null, timelineEventId: number) =>
  Array.isArray(plan?.linkedContent) && plan.linkedContent.some((link) =>
    link && typeof link === "object" && (link as { relationTo?: unknown }).relationTo === "timeline-events" && relationId((link as { value?: unknown }).value) === timelineEventId,
  );

const conditionalUpdate = async (input: {
  after: Record<string, unknown>;
  before: Record<string, unknown>;
  collection: Collection;
  payload: ScheduleCompletionPayload;
}) => {
  const updatedAt = input.after.updatedAt;
  if (typeof updatedAt !== "string" || !isId(input.after.id)) return false;
  try {
    const result = await input.payload.update({
      collection: input.collection,
      data: input.before,
      overrideAccess: true,
      where: { and: [{ id: { equals: input.after.id } }, { updatedAt: { equals: updatedAt } }] },
    });
    return Boolean(result && typeof result === "object" && Array.isArray((result as { docs?: unknown }).docs) && (result as { docs: Array<{ id?: unknown }>; errors?: unknown[] }).docs.length === 1 && (result as { docs: Array<{ id?: unknown }>; errors?: unknown[] }).docs[0]?.id === input.after.id && (!(result as { errors?: unknown[] }).errors || (result as { errors?: unknown[] }).errors?.length === 0));
  } catch { return false; }
};

const conditionalDelete = async (input: { after: TimelineEvent; payload: ScheduleCompletionPayload }) => {
  const updatedAt = input.after.updatedAt;
  if (typeof updatedAt !== "string") return false;
  try {
    const result = await input.payload.delete({
      collection: "timeline-events",
      overrideAccess: true,
      where: { and: [{ id: { equals: input.after.id } }, { updatedAt: { equals: updatedAt } }] },
    });
    return Boolean(result && typeof result === "object" && Array.isArray((result as { docs?: unknown }).docs) && (result as { docs: Array<{ id?: unknown }>; errors?: unknown[] }).docs.length === 1 && (result as { docs: Array<{ id?: unknown }>; errors?: unknown[] }).docs[0]?.id === input.after.id && (!(result as { errors?: unknown[] }).errors || (result as { errors?: unknown[] }).errors?.length === 0));
  } catch { return false; }
};

export async function completeScheduleItem(input: {
  actor: CoreLinkageActor;
  additionalPatch?: Omit<ScheduleRecordPatch, "status">;
  completedAt?: string;
  itemId: number;
  payload: ScheduleCompletionPayload;
}): Promise<ScheduleCompletionResult> {
  if (!isActor(input.actor)) return fail("invalid_actor");
  if (!isId(input.itemId) || (input.completedAt != null && (typeof input.completedAt !== "string" || input.completedAt.length === 0))) return fail("invalid_reference");

  const rawSchedule = await readExact(input.payload, "schedule-items", input.itemId);
  if (isFailure(rawSchedule)) return rawSchedule;
  if (!isSchedule(rawSchedule)) return fail("resource_not_found");
  const schedule = rawSchedule;
  const checklistId = relationId(schedule.relatedChecklist);
  const itemKey = typeof schedule.relatedChecklistItemKey === "string" && schedule.relatedChecklistItemKey.length > 0 ? schedule.relatedChecklistItemKey : null;
  if ((checklistId == null) !== (itemKey == null)) return fail("invalid_reference");

  const previousTimeline = await exactTimeline(input.payload, input.itemId);
  if (isFailure(previousTimeline)) return previousTimeline;
  const schedulePlanId = relationId(schedule.relatedPlan);
  let planDocument: Record<string, unknown> | null = null;
  let checklist: Checklist | null = null;
  let checklistPlanId: number | null = null;
  if (checklistId != null && itemKey != null) {
    const rawChecklist = await readExact(input.payload, "checklists", checklistId);
    if (isFailure(rawChecklist) || !isChecklist(rawChecklist)) return isFailure(rawChecklist) ? rawChecklist : fail("resource_not_found");
    checklist = rawChecklist;
    checklistPlanId = relationId(checklist.planId);
  }
  if (schedulePlanId != null) {
    const plan = await readExact(input.payload, "plans", schedulePlanId);
    if (isFailure(plan)) return plan;
    planDocument = plan;
  }
  if (checklistPlanId != null) {
    const plan = await readExact(input.payload, "plans", checklistPlanId);
    if (isFailure(plan)) return plan;
    planDocument = plan;
  }
  if (schedulePlanId != null && checklistPlanId != null && schedulePlanId !== checklistPlanId) return fail("invalid_reference");
  const planId = schedulePlanId ?? checklistPlanId;
  const eventDate = input.completedAt ?? (previousTimeline?.sourceType === "schedule" && typeof previousTimeline.eventDate === "string" ? previousTimeline.eventDate : new Date().toISOString());
  const desiredTimelineData = {
    description: `完成日程：${schedule.title}`,
    eventDate,
    isFeatured: false,
    relatedChecklist: checklistId,
    relatedPlan: planId,
    relatedPost: relationId(previousTimeline?.relatedPost),
    relatedScheduleItem: schedule.id,
    relatedTaskKey: null,
    relatedUpdate: relationId(previousTimeline?.relatedUpdate),
    sortOrder: 0,
    sourceType: "schedule",
    status: "published",
    title: `完成日程：${schedule.title}`,
    type: "project",
    visibility: "private",
  };
  const scheduleMatches = schedule.status === "done" && Object.entries(input.additionalPatch ?? {}).every(([key, value]) => schedule[key] === value);
  const alreadyComplete = scheduleMatches && previousTimeline != null && sameData(snapshotTimeline(previousTimeline), desiredTimelineData) && (!checklist || checklistItemIsDone(checklist, itemKey!)) && (planId == null || planHasTimelineLink(planDocument, previousTimeline!.id));
  if (alreadyComplete) {
    return { affectedDocuments: [], changed: false, ok: true, rollbackPayload: { beforeSnapshot: { checklistGroups: checklist?.groups ?? null, schedule: snapshotSchedule(schedule), timelineEvent: previousTimeline ? snapshotTimeline(previousTimeline) : null }, strategy: "restore_schedule_completion", target: { checklistId, itemId: input.itemId, planId, timelineEventId: previousTimeline.id } }, schedule, timelineEvent: previousTimeline! };
  }

  const beforeSchedule = snapshotSchedule(schedule);
  const scheduleData = { ...(input.additionalPatch ?? {}), status: "done" as const };
  let updatedSchedule = schedule;
  if (schedule.status !== "done" || Object.keys(input.additionalPatch ?? {}).length > 0) {
    try {
      const written = await input.payload.update({ collection: "schedule-items", data: scheduleData, id: schedule.id, overrideAccess: true });
      if (!isSchedule(written)) return fail("schedule_write_failed");
      updatedSchedule = written;
    } catch {
      const current = await readExact(input.payload, "schedule-items", schedule.id);
      if (isFailure(current) || JSON.stringify(snapshotSchedule(current as ScheduleDocument)) !== JSON.stringify({ ...beforeSchedule, ...scheduleData })) return fail("compensation_failed");
      return fail("schedule_write_failed");
    }
  }

  const timelineData = {
    description: `完成日程：${updatedSchedule.title}`,
    eventDate,
    isFeatured: false,
    relatedChecklist: checklistId,
    relatedPlan: planId,
    relatedPost: relationId(previousTimeline?.relatedPost),
    relatedScheduleItem: updatedSchedule.id,
    relatedTaskKey: null,
    relatedUpdate: relationId(previousTimeline?.relatedUpdate),
    sortOrder: 0,
    sourceType: "schedule",
    status: "published",
    title: `完成日程：${updatedSchedule.title}`,
    type: "project",
    visibility: "private",
  };
  let timelineEvent: TimelineEvent;
  const timelineCreated = previousTimeline == null;
  try {
    const written = previousTimeline
      ? await input.payload.update({ collection: "timeline-events", data: timelineData, id: previousTimeline.id, overrideAccess: true })
      : await input.payload.create({ collection: "timeline-events", data: timelineData, overrideAccess: true });
    if (!isTimeline(written)) throw new Error("invalid timeline response");
    timelineEvent = written;
  } catch {
    const reconciled = await exactTimeline(input.payload, updatedSchedule.id);
    if (isTimeline(reconciled) && sameData(snapshotTimeline(reconciled), timelineData)) {
      timelineEvent = reconciled;
    } else {
      const restored = await conditionalUpdate({ after: updatedSchedule, before: beforeSchedule, collection: "schedule-items", payload: input.payload });
      return restored ? fail("timeline_write_failed") : fail("compensation_failed");
    }
  }

  let planLinkChanged = false;
  let schedulePlanLink: { afterLinkedContent: unknown; beforeLinkedContent: unknown; changed: boolean; planId: number } | undefined;
  if (planId != null) {
    const linked = await linkTimelineToPlan({ payload: input.payload as unknown as CoreLinkagePayload, planId, timelineEventId: timelineEvent.id });
    if (!linked.ok) {
      if (linked.code === "compensation_failed") return fail("compensation_failed");
      const current = await readExact(input.payload, "timeline-events", timelineEvent.id);
      if (isFailure(current) || !isTimeline(current) || !sameData(snapshotTimeline(current), timelineData)) return fail("compensation_failed");
      const timelineRestored = timelineCreated
        ? await conditionalDelete({ after: timelineEvent, payload: input.payload })
        : await conditionalUpdate({ after: timelineEvent as unknown as Record<string, unknown>, before: snapshotTimeline(previousTimeline!), collection: "timeline-events", payload: input.payload });
      if (!timelineRestored) return fail("compensation_failed");
      const scheduleRestored = await conditionalUpdate({ after: updatedSchedule, before: beforeSchedule, collection: "schedule-items", payload: input.payload });
      if (!scheduleRestored) return fail("compensation_failed");
      return fail("timeline_write_failed");
    }
    planLinkChanged = linked.changed;
    schedulePlanLink = { afterLinkedContent: linked.afterLinkedContent, beforeLinkedContent: linked.beforeLinkedContent, changed: linked.changed, planId };
  }

  let beforeGroups: null | NonNullable<Checklist["groups"]> = null;
  let checklistCompletion: ReturnType<typeof buildChecklistGroupsAndTimelineRollbackPayload> | undefined;
  let checklistAffectedDocuments: AffectedDocument[] = [];
  if (checklist && itemKey) {
    const completed = await completeChecklistItemByKey({ checklistId: checklist.id, completedAt: input.completedAt ?? new Date().toISOString(), itemKey, payload: input.payload as unknown as ChecklistCompletionPayload });
    if (!completed.ok) {
      return fail("compensation_failed");
    }
    beforeGroups = completed.beforeGroups;
    checklistCompletion = buildChecklistGroupsAndTimelineRollbackPayload(
      checklist.id,
      completed.beforeGroups,
      completed.previousTimelineEvent as unknown as null | Record<string, unknown>,
      completed.timelineEvent.id,
      { planId: completed.planId, planLinkChanged: completed.planLinkChanged, planLinkedContent: completed.planLinkedContent },
    );
    checklistAffectedDocuments = completed.affectedDocuments.map((document) => ({ ...document }));
  }

  const affectedDocuments: AffectedDocument[] = [
    { collection: "schedule-items", documentId: updatedSchedule.id, operation: "update", visibility: "private" },
    { collection: "timeline-events", documentId: timelineEvent.id, operation: timelineCreated ? "create" : "update", visibility: timelineEvent.visibility },
  ];
  if (planId != null) affectedDocuments.push({ collection: "plans", documentId: planId, operation: "update", visibility: "unknown" });
  const dedupedAffectedDocuments = [...affectedDocuments, ...checklistAffectedDocuments].filter((document, index, documents) =>
    documents.findIndex((candidate) => candidate.collection === document.collection && candidate.documentId === document.documentId && candidate.operation === document.operation) === index,
  );
  return { affectedDocuments: dedupedAffectedDocuments, changed: true, ok: true, rollbackPayload: { beforeSnapshot: { ...(checklistCompletion ? { checklistCompletion } : {}), checklistGroups: beforeGroups, schedule: beforeSchedule, ...(schedulePlanLink ? { schedulePlanLink } : {}), timelineEvent: previousTimeline ? snapshotTimeline(previousTimeline) : null }, strategy: "restore_schedule_completion", target: { checklistId, itemId: input.itemId, planId, timelineEventId: timelineEvent.id } }, schedule: updatedSchedule, timelineEvent };
}
