import type { Checklist, TimelineEvent } from "@/payload-types";

import type { ScheduleRecordPatch } from "@/lib/agent/schemas";
import { completeChecklistItemByKey, type ChecklistCompletionPayload } from "@/lib/core-linkage/checklist-completion";
import { linkTimelineToPlan, unlinkTimelineFromPlan, type CoreLinkageActor, type CoreLinkagePayload } from "@/lib/core-linkage/service";

if (typeof window !== "undefined") {
  throw new Error("The Schedule completion service is server-only.");
}

type Collection = "checklists" | "plans" | "schedule-items" | "timeline-events";

type FindByIDArgs = { collection: Collection; depth: 0; id: number; overrideAccess: boolean };
type FindArgs = { collection: "timeline-events"; depth: 0; limit: number; overrideAccess: boolean; pagination: false; where: unknown };
type UpdateArgs = { collection: Collection; context?: Record<string, unknown>; data: Record<string, unknown>; depth?: 0; id: number; overrideAccess: boolean };

export type ScheduleCompletionPayload = {
  create: (args: { collection: "timeline-events"; data: Record<string, unknown>; overrideAccess: boolean }) => Promise<unknown>;
  delete: (args: { collection: "timeline-events"; id: number; overrideAccess: boolean }) => Promise<unknown>;
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
    beforeSnapshot: { checklistGroups: null | NonNullable<Checklist["groups"]>; schedule: Record<string, unknown>; timelineEvent: null | Record<string, unknown> };
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
  }
  if (checklistPlanId != null) {
    const plan = await readExact(input.payload, "plans", checklistPlanId);
    if (isFailure(plan)) return plan;
  }
  if (schedulePlanId != null && checklistPlanId != null && schedulePlanId !== checklistPlanId) return fail("invalid_reference");
  const planId = schedulePlanId ?? checklistPlanId;
  const alreadyComplete = schedule.status === "done" && previousTimeline != null && (!checklist || checklistItemIsDone(checklist, itemKey!));
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
    eventDate: input.completedAt ?? new Date().toISOString(),
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
    try {
      await input.payload.update({ collection: "schedule-items", data: beforeSchedule, id: schedule.id, overrideAccess: true });
    } catch { return fail("compensation_failed"); }
    return fail("timeline_write_failed");
  }

  let planLinkChanged = false;
  if (planId != null) {
    const linked = await linkTimelineToPlan({ payload: input.payload as unknown as CoreLinkagePayload, planId, timelineEventId: timelineEvent.id });
    if (!linked.ok) {
      const current = await readExact(input.payload, "timeline-events", timelineEvent.id);
      if (isFailure(current) || !isTimeline(current) || !sameData(snapshotTimeline(current), timelineData)) return fail("compensation_failed");
      try {
        if (timelineCreated) await input.payload.delete({ collection: "timeline-events", id: timelineEvent.id, overrideAccess: true });
        else await input.payload.update({ collection: "timeline-events", data: snapshotTimeline(previousTimeline!), id: timelineEvent.id, overrideAccess: true });
        await input.payload.update({ collection: "schedule-items", data: beforeSchedule, id: schedule.id, overrideAccess: true });
      } catch { return fail("compensation_failed"); }
      return fail("timeline_write_failed");
    }
    planLinkChanged = linked.changed;
  }

  let beforeGroups: null | NonNullable<Checklist["groups"]> = null;
  if (checklist && itemKey) {
    const completed = await completeChecklistItemByKey({ checklistId: checklist.id, completedAt: input.completedAt ?? new Date().toISOString(), itemKey, payload: input.payload as unknown as ChecklistCompletionPayload });
    if (!completed.ok) {
      let compensated = true;
      if (planId != null && planLinkChanged) {
        const unlinked = await unlinkTimelineFromPlan({ payload: input.payload as unknown as CoreLinkagePayload, planId, timelineEventId: timelineEvent.id });
        compensated = unlinked.ok;
      }
      const current = await readExact(input.payload, "timeline-events", timelineEvent.id);
      if (isFailure(current) || !isTimeline(current) || !sameData(snapshotTimeline(current), timelineData)) compensated = false;
      if (compensated) {
        try {
          if (timelineCreated) await input.payload.delete({ collection: "timeline-events", id: timelineEvent.id, overrideAccess: true });
          else await input.payload.update({ collection: "timeline-events", data: snapshotTimeline(previousTimeline!), id: timelineEvent.id, overrideAccess: true });
          const currentSchedule = await readExact(input.payload, "schedule-items", schedule.id);
          if (isFailure(currentSchedule) || !isSchedule(currentSchedule) || !sameData(snapshotSchedule(currentSchedule), { ...beforeSchedule, ...scheduleData })) compensated = false;
          else await input.payload.update({ collection: "schedule-items", data: beforeSchedule, id: schedule.id, overrideAccess: true });
        } catch { compensated = false; }
      }
      return compensated ? fail("checklist_completion_failed") : fail("compensation_failed");
    }
    beforeGroups = completed.beforeGroups;
  }

  const affectedDocuments: AffectedDocument[] = [
    { collection: "schedule-items", documentId: updatedSchedule.id, operation: "update", visibility: "private" },
    { collection: "timeline-events", documentId: timelineEvent.id, operation: timelineCreated ? "create" : "update", visibility: timelineEvent.visibility },
  ];
  if (planId != null) affectedDocuments.push({ collection: "plans", documentId: planId, operation: "update", visibility: "unknown" });
  if (checklist) affectedDocuments.push({ collection: "checklists", documentId: checklist.id, operation: "update", visibility: checklist.visibility });
  return { affectedDocuments, changed: true, ok: true, rollbackPayload: { beforeSnapshot: { checklistGroups: beforeGroups, schedule: beforeSchedule, timelineEvent: previousTimeline ? snapshotTimeline(previousTimeline) : null }, strategy: "restore_schedule_completion", target: { checklistId, itemId: input.itemId, planId, timelineEventId: timelineEvent.id } }, schedule: updatedSchedule, timelineEvent };
}
