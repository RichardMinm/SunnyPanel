import type { Payload } from "payload";

import { getPayloadClient } from "../payload/client";
import {
  detectScheduleConflictsInList,
  isValidScheduleTime,
  toScheduleDateKey,
  type ScheduleConflictItem,
} from "./conflicts";

export type ScheduleItemStatus = "canceled" | "done" | "planned" | "skipped";
export type ScheduleItemPriority = "high" | "low" | "medium";
export type ScheduleItemSourceType = "agent" | "checklist" | "manual" | "plan";
export type ScheduleItemCreatedBy = "agent" | "manual";

export type ScheduleItemRecord = ScheduleConflictItem & {
  agentBrief?: null | string;
  category?: null | string;
  conflictNote?: null | string;
  createdBy?: ScheduleItemCreatedBy;
  description?: null | string;
  priority: ScheduleItemPriority;
  relatedChecklist?: null | number | { id?: number; title?: string };
  relatedChecklistItemKey?: null | string;
  relatedPlan?: null | number | { id?: number; title?: string };
  sourceType: ScheduleItemSourceType;
};

export type ScheduleItemInput = {
  agentBrief?: null | string;
  category?: null | string;
  conflictNote?: null | string;
  createdBy?: ScheduleItemCreatedBy;
  date: string;
  description?: null | string;
  endTime?: null | string;
  isAllDay?: boolean;
  priority?: ScheduleItemPriority;
  relatedChecklist?: null | number;
  relatedChecklistItemKey?: null | string;
  relatedPlan?: null | number;
  sourceType?: ScheduleItemSourceType;
  startTime?: null | string;
  status?: ScheduleItemStatus;
  title: string;
};

const scheduleCollection = "schedule-items";
const dayInMs = 24 * 60 * 60 * 1000;

const normalizeText = (value: null | string | undefined) => value?.trim() ?? "";

const startOfDate = (date: string | Date) => {
  const value = typeof date === "string" ? new Date(date) : date;

  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
};

const endOfDate = (date: string | Date) => new Date(startOfDate(date).getTime() + dayInMs);

const getPayload = async (payload?: Payload) => payload ?? getPayloadClient();

export const getScheduleForDate = async (date: string | Date, payload?: Payload): Promise<ScheduleItemRecord[]> => {
  const payloadClient = (await getPayload(payload)) as unknown as {
    find: (args: unknown) => Promise<{ docs: ScheduleItemRecord[] }>;
  };
  const dayStart = startOfDate(date).toISOString();
  const dayEnd = endOfDate(date).toISOString();
  const result = await payloadClient.find({
    collection: scheduleCollection,
    depth: 1,
    limit: 100,
    overrideAccess: true,
    sort: "startTime",
    where: {
      and: [
        {
          date: {
            greater_than_equal: dayStart,
          },
        },
        {
          date: {
            less_than: dayEnd,
          },
        },
      ],
    },
  });

  return result.docs;
};

export const getScheduleItemById = async (
  itemId: number,
  payload?: Payload,
): Promise<null | ScheduleItemRecord> => {
  const payloadClient = (await getPayload(payload)) as unknown as {
    findByID: (args: unknown) => Promise<null | ScheduleItemRecord>;
  };

  try {
    return await payloadClient.findByID({
      collection: scheduleCollection,
      id: itemId,
      overrideAccess: true,
    });
  } catch {
    return null;
  }
};

export const getTodaySchedule = (payload?: Payload) => getScheduleForDate(new Date(), payload);

export const getTomorrowSchedule = (payload?: Payload) =>
  getScheduleForDate(new Date(Date.now() + dayInMs), payload);

export const detectScheduleConflicts = async (
  date: string,
  startTime?: null | string,
  endTime?: null | string,
  excludeId?: number,
  payload?: Payload,
) => {
  const items = await getScheduleForDate(date, payload);

  return detectScheduleConflictsInList(items, date, startTime, endTime, excludeId);
};

const normalizeScheduleInput = (data: ScheduleItemInput) => ({
  agentBrief: normalizeText(data.agentBrief) || null,
  category: data.category ?? null,
  conflictNote: normalizeText(data.conflictNote) || null,
  createdBy: data.createdBy ?? "manual",
  date: data.date,
  description: normalizeText(data.description) || null,
  endTime: normalizeText(data.endTime) || null,
  isAllDay: data.isAllDay ?? false,
  priority: data.priority ?? "medium",
  relatedChecklist: data.relatedChecklist ?? null,
  relatedChecklistItemKey: normalizeText(data.relatedChecklistItemKey) || null,
  relatedPlan: data.relatedPlan ?? null,
  sourceType: data.sourceType ?? "manual",
  startTime: normalizeText(data.startTime) || null,
  status: data.status ?? "planned",
  title: data.title.trim(),
});

export const createScheduleItem = async (data: ScheduleItemInput, payload?: Payload): Promise<ScheduleItemRecord> => {
  const payloadClient = (await getPayload(payload)) as unknown as {
    create: (args: unknown) => Promise<ScheduleItemRecord>;
  };

  return payloadClient.create({
    collection: scheduleCollection,
    data: normalizeScheduleInput(data),
    overrideAccess: true,
  });
};

export const updateScheduleItemStatus = async (
  id: number,
  status: ScheduleItemStatus,
  payload?: Payload,
): Promise<ScheduleItemRecord> => {
  const payloadClient = (await getPayload(payload)) as unknown as {
    update: (args: unknown) => Promise<ScheduleItemRecord>;
  };

  return payloadClient.update({
    collection: scheduleCollection,
    data: {
      status,
    },
    id,
    overrideAccess: true,
  });
};

export { detectScheduleConflictsInList, isValidScheduleTime, toScheduleDateKey };
