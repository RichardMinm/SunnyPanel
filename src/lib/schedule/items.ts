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

export const startOfDate = (date: string | Date) => {
  const value = typeof date === "string" ? new Date(date) : date;

  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
};

export const endOfDate = (date: string | Date) => new Date(startOfDate(date).getTime() + dayInMs);

/** Get Monday 00:00 of the week containing `date`. */
export const startOfWeek = (date: Date = new Date()): Date => {
  const d = startOfDate(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday-based week
  return new Date(d.getTime() + diff * dayInMs);
};

/** Get Sunday 23:59:59.999 of the week containing `date`. */
export const endOfWeek = (date: Date = new Date()): Date => {
  const start = startOfWeek(date);
  return new Date(start.getTime() + 7 * dayInMs - 1);
};

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

/**
 * Get schedule items for a date range (inclusive start, exclusive end).
 * Uses multiple single-day queries to stay within existing query patterns.
 */
export const getScheduleForDateRange = async (
  startDate: Date,
  endDate: Date,
  payload?: Payload,
): Promise<ScheduleItemRecord[]> => {
  const days: Date[] = [];
  let cursor = startOfDate(startDate);
  const end = startOfDate(endDate);
  while (cursor <= end) {
    days.push(cursor);
    cursor = new Date(cursor.getTime() + dayInMs);
  }
  const results = await Promise.all(days.map((d) => getScheduleForDate(d, payload)));
  return results.flat();
};

/**
 * Get schedule items for a semantic date range.
 */
export const getScheduleForRange = async (
  range: import("@/lib/agent/context-loading-policy").ScheduleDateRange,
  payload?: Payload,
): Promise<ScheduleItemRecord[]> => {
  const now = new Date();
  switch (range.type) {
    case "today":
      return getTodaySchedule(payload);
    case "tomorrow":
      return getTomorrowSchedule(payload);
    case "this_week":
      return getScheduleForDateRange(startOfWeek(now), endOfWeek(now), payload);
    case "next_week": {
      const nextWeek = new Date(now.getTime() + 7 * dayInMs);
      return getScheduleForDateRange(startOfWeek(nextWeek), endOfWeek(nextWeek), payload);
    }
    case "upcoming": {
      const days = Math.max(1, Math.min(range.days ?? 7, 31));
      return getScheduleForDateRange(now, new Date(now.getTime() + (days - 1) * dayInMs), payload);
    }
    case "custom":
      return getScheduleForDateRange(new Date(range.start), new Date(range.end), payload);
    default:
      return getTodaySchedule(payload);
  }
};

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
