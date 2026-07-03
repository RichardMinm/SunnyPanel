export type ScheduleReadinessStatus =
  | "insufficient"
  | "draftable"
  | "confirmable";

export type ScheduleSourceType =
  | "plan"
  | "checklist"
  | "manual";

export type ScheduleSlotKey =
  | "sourceType"
  | "sourcePlanId"
  | "sourceChecklistId"
  | "tasks"
  | "deadline"
  | "availableDays"
  | "availableTimeWindows"
  | "dailyCapacity"
  | "preferredTime"
  | "excludedDates"
  | "priorityRule"
  | "durationEstimate"
  | "scheduleGranularity"
  | "conflictPolicy";

export type ScheduleTaskSlot = {
  title: string;
  sourceTaskTitle?: string | null;
  sourceChecklistItemKey?: string | null;
  sourcePlanId?: number | null;
  sourceChecklistId?: number | null;
  estimatedMinutes?: number | null;
  priority?: "low" | "medium" | "high" | null;
};

export type ScheduleTimeWindow = {
  day?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

export type ScheduleSlots = {
  sourceType?: ScheduleSourceType | null;
  sourcePlanId?: number | null;
  sourceChecklistId?: number | null;
  tasks?: ScheduleTaskSlot[] | null;
  deadline?: string | null;
  availableDays?: string[] | null;
  availableTimeWindows?: ScheduleTimeWindow[] | null;
  dailyCapacity?: string | null;
  preferredTime?: string | null;
  excludedDates?: string[] | null;
  priorityRule?: string | null;
  durationEstimate?: string | null;
  scheduleGranularity?: "day" | "time-block" | "unscheduled" | null;
  conflictPolicy?: "ask" | "skip" | "allow-overlap" | "reschedule" | null;
};

export type ScheduleReadiness = {
  status: ScheduleReadinessStatus;
  confidence: number;
  knownSlots: ScheduleSlotKey[];
  missingSlots: ScheduleSlotKey[];
  suggestedQuestions: string[];
  reason: string;
};

export type EvaluateScheduleReadinessInput = {
  userMessage: string;
  slots?: ScheduleSlots;
  sessionSlots?: ScheduleSlots;
  hasExistingDraft?: boolean;
  explicitCreateIntent?: boolean;
};

const SLOT_KEYS: readonly ScheduleSlotKey[] = [
  "sourceType",
  "sourcePlanId",
  "sourceChecklistId",
  "tasks",
  "deadline",
  "availableDays",
  "availableTimeWindows",
  "dailyCapacity",
  "preferredTime",
  "excludedDates",
  "priorityRule",
  "durationEstimate",
  "scheduleGranularity",
  "conflictPolicy",
];

const normalizeText = (value: string): string => value.trim().replace(/\s+/g, " ");

const isUsefulString = (value: unknown): value is string =>
  typeof value === "string" && normalizeText(value).length > 0;

const isUsefulNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const normalizeStringList = (value: null | string[] | undefined): string[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeText(item))
    .filter(Boolean);
};

const mergeUnique = <T>(items: T[], keyOf: (item: T) => string): T[] => {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
};

const normalizePriority = (value: unknown): ScheduleTaskSlot["priority"] | undefined =>
  value === "high" || value === "medium" || value === "low" ? value : undefined;

const normalizeTask = (raw: ScheduleTaskSlot): ScheduleTaskSlot | null => {
  if (!isUsefulString(raw.title)) return null;

  return {
    title: normalizeText(raw.title),
    ...(isUsefulString(raw.sourceTaskTitle) ? { sourceTaskTitle: normalizeText(raw.sourceTaskTitle) } : {}),
    ...(isUsefulString(raw.sourceChecklistItemKey) ? { sourceChecklistItemKey: normalizeText(raw.sourceChecklistItemKey) } : {}),
    ...(isUsefulNumber(raw.sourcePlanId) ? { sourcePlanId: raw.sourcePlanId } : raw.sourcePlanId === null ? { sourcePlanId: null } : {}),
    ...(isUsefulNumber(raw.sourceChecklistId) ? { sourceChecklistId: raw.sourceChecklistId } : raw.sourceChecklistId === null ? { sourceChecklistId: null } : {}),
    ...(isUsefulNumber(raw.estimatedMinutes) ? { estimatedMinutes: raw.estimatedMinutes } : raw.estimatedMinutes === null ? { estimatedMinutes: null } : {}),
    ...(normalizePriority(raw.priority) ? { priority: normalizePriority(raw.priority) } : raw.priority === null ? { priority: null } : {}),
  };
};

const taskKey = (task: ScheduleTaskSlot): string =>
  `${normalizeText(task.title).toLowerCase()}::${task.sourceChecklistItemKey ?? ""}`;

const mergeTasks = (
  first?: null | ScheduleTaskSlot[],
  second?: null | ScheduleTaskSlot[],
): ScheduleTaskSlot[] => {
  const byKey = new Map<string, ScheduleTaskSlot>();

  for (const task of [...(first ?? []), ...(second ?? [])]) {
    const normalized = normalizeTask(task);
    if (!normalized) continue;
    const key = taskKey(normalized);
    const previous = byKey.get(key);
    byKey.set(key, previous ? { ...previous, ...normalized } : normalized);
  }

  return Array.from(byKey.values());
};

const normalizeWindow = (raw: ScheduleTimeWindow): ScheduleTimeWindow | null => {
  const day = isUsefulString(raw.day) ? normalizeText(raw.day) : null;
  const startTime = isUsefulString(raw.startTime) ? normalizeText(raw.startTime) : null;
  const endTime = isUsefulString(raw.endTime) ? normalizeText(raw.endTime) : null;

  if (!day && !startTime && !endTime) return null;

  return {
    ...(day ? { day } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
  };
};

const windowKey = (window: ScheduleTimeWindow): string =>
  `${window.day ?? ""}::${window.startTime ?? ""}::${window.endTime ?? ""}`;

const mergeWindows = (
  first?: null | ScheduleTimeWindow[],
  second?: null | ScheduleTimeWindow[],
): ScheduleTimeWindow[] =>
  mergeUnique(
    [...(first ?? []), ...(second ?? [])]
      .map(normalizeWindow)
      .filter((item): item is ScheduleTimeWindow => Boolean(item)),
    windowKey,
  );

const mergeStringLists = (
  first?: null | string[],
  second?: null | string[],
): string[] =>
  mergeUnique([...normalizeStringList(first), ...normalizeStringList(second)], (item) => item);

const setStringSlot = <TKey extends keyof ScheduleSlots>(
  target: ScheduleSlots,
  key: TKey,
  sessionValue: unknown,
  extractedValue: unknown,
) => {
  if (isUsefulString(sessionValue)) {
    target[key] = normalizeText(sessionValue) as never;
  } else if (sessionValue === null) {
    target[key] = null as never;
  }

  if (isUsefulString(extractedValue)) {
    target[key] = normalizeText(extractedValue) as never;
  } else if (!isUsefulString(target[key]) && extractedValue === null) {
    target[key] = null as never;
  }
};

export const mergeScheduleSlots = (
  sessionSlots?: ScheduleSlots,
  extractedSlots?: ScheduleSlots,
): ScheduleSlots => {
  const merged: ScheduleSlots = {};

  if (sessionSlots?.sourceType) merged.sourceType = sessionSlots.sourceType;
  if (extractedSlots?.sourceType) merged.sourceType = extractedSlots.sourceType;

  if (isUsefulNumber(sessionSlots?.sourcePlanId)) merged.sourcePlanId = sessionSlots.sourcePlanId;
  else if (sessionSlots?.sourcePlanId === null) merged.sourcePlanId = null;
  if (isUsefulNumber(extractedSlots?.sourcePlanId)) merged.sourcePlanId = extractedSlots.sourcePlanId;
  else if (!isUsefulNumber(merged.sourcePlanId) && extractedSlots?.sourcePlanId === null) merged.sourcePlanId = null;

  if (isUsefulNumber(sessionSlots?.sourceChecklistId)) merged.sourceChecklistId = sessionSlots.sourceChecklistId;
  else if (sessionSlots?.sourceChecklistId === null) merged.sourceChecklistId = null;
  if (isUsefulNumber(extractedSlots?.sourceChecklistId)) merged.sourceChecklistId = extractedSlots.sourceChecklistId;
  else if (!isUsefulNumber(merged.sourceChecklistId) && extractedSlots?.sourceChecklistId === null) merged.sourceChecklistId = null;

  for (const key of ["deadline", "dailyCapacity", "preferredTime", "priorityRule", "durationEstimate"] as const) {
    setStringSlot(merged, key, sessionSlots?.[key], extractedSlots?.[key]);
  }

  if (sessionSlots?.scheduleGranularity) merged.scheduleGranularity = sessionSlots.scheduleGranularity;
  if (extractedSlots?.scheduleGranularity) merged.scheduleGranularity = extractedSlots.scheduleGranularity;
  if (sessionSlots?.conflictPolicy) merged.conflictPolicy = sessionSlots.conflictPolicy;
  if (extractedSlots?.conflictPolicy) merged.conflictPolicy = extractedSlots.conflictPolicy;

  const tasks = mergeTasks(sessionSlots?.tasks, extractedSlots?.tasks);
  if (tasks.length > 0) merged.tasks = tasks;
  else if (sessionSlots?.tasks === null || extractedSlots?.tasks === null) merged.tasks = null;

  const availableDays = mergeStringLists(sessionSlots?.availableDays, extractedSlots?.availableDays);
  if (availableDays.length > 0) merged.availableDays = availableDays;
  else if (sessionSlots?.availableDays === null || extractedSlots?.availableDays === null) merged.availableDays = null;

  const excludedDates = mergeStringLists(sessionSlots?.excludedDates, extractedSlots?.excludedDates);
  if (excludedDates.length > 0) merged.excludedDates = excludedDates;
  else if (sessionSlots?.excludedDates === null || extractedSlots?.excludedDates === null) merged.excludedDates = null;

  const windows = mergeWindows(sessionSlots?.availableTimeWindows, extractedSlots?.availableTimeWindows);
  if (windows.length > 0) merged.availableTimeWindows = windows;
  else if (sessionSlots?.availableTimeWindows === null || extractedSlots?.availableTimeWindows === null) {
    merged.availableTimeWindows = null;
  }

  return merged;
};

const chineseHourMap: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

const parseHour = (value: string): number | null => {
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "十二") return 12;
  if (value.startsWith("十")) return 10 + (chineseHourMap[value.slice(1)] ?? 0);
  if (value.includes("十")) {
    const [left, right] = value.split("十");
    return (chineseHourMap[left ?? ""] ?? 1) * 10 + (chineseHourMap[right ?? ""] ?? 0);
  }
  return chineseHourMap[value] ?? null;
};

const formatTime = (hour: number, minute = 0): string =>
  `${String(Math.max(0, Math.min(23, hour))).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

const adjustHour = (hour: number, meridiem: string): number =>
  /(下午|晚上|今晚)/.test(meridiem) && hour < 12
    ? hour + 12
    : /中午/.test(meridiem) && hour < 11
      ? hour + 12
      : hour;

const inferPreferredTime = (message: string): string | null => {
  if (/晚上|今晚/.test(message)) return "晚上";
  if (/上午|早上|明早|今早/.test(message)) return "上午";
  if (/下午|午后/.test(message)) return "下午";
  if (/周末/.test(message)) return "周末";
  if (/工作日/.test(message)) return "工作日";
  return null;
};

const extractAvailableDays = (message: string): string[] | undefined => {
  const days: string[] = [];
  if (/每天/.test(message)) days.push("每天");
  if (/工作日/.test(message)) days.push("工作日");
  if (/周末/.test(message)) days.push("周末");
  for (const match of message.matchAll(/周[一二三四五六日天]/g)) {
    days.push(match[0]);
  }
  return days.length > 0 ? mergeUnique(days, (day) => day) : undefined;
};

const extractTimeWindows = (message: string): ScheduleTimeWindow[] | undefined => {
  const windows: ScheduleTimeWindow[] = [];
  const numericRange = message.match(/([01]?\d|2[0-3])[:：]([0-5]\d)\s*(?:-|到|至|~|—)\s*([01]?\d|2[0-3])[:：]([0-5]\d)/);
  if (numericRange) {
    windows.push({
      startTime: formatTime(Number(numericRange[1]), Number(numericRange[2])),
      endTime: formatTime(Number(numericRange[3]), Number(numericRange[4])),
    });
  }

  const dayMatch = message.match(/(每天|工作日|周末|周[一二三四五六日天])?/);
  const day = dayMatch?.[1] ? normalizeText(dayMatch[1]) : undefined;
  const zhRange = message.match(
    /(上午|早上|下午|晚上|今晚|中午)?\s*([零一二三四五六七八九十\d]{1,3})\s*点\s*(?:到|至|-)\s*(上午|早上|下午|晚上|今晚|中午)?\s*([零一二三四五六七八九十\d]{1,3})\s*点/u,
  );
  if (zhRange) {
    const startHour = parseHour(zhRange[2] ?? "");
    const endHour = parseHour(zhRange[4] ?? "");
    const meridiem = zhRange[1] ?? zhRange[3] ?? inferPreferredTime(message) ?? "";
    const endMeridiem = zhRange[3] ?? meridiem;
    if (startHour !== null && endHour !== null) {
      windows.push({
        ...(day ? { day } : {}),
        startTime: formatTime(adjustHour(startHour, meridiem)),
        endTime: formatTime(adjustHour(endHour, endMeridiem)),
      });
    }
  }

  const normalized = mergeWindows(windows, undefined);
  return normalized.length > 0 ? normalized : undefined;
};

const extractDailyCapacity = (message: string): string | null => {
  const match =
    message.match(/每天\s*\d+(?:\.\d+)?\s*(?:小时|分钟)/) ??
    message.match(/每周\s*\d+\s*天/) ??
    message.match(/周末半天/);
  return match ? normalizeText(match[0]) : null;
};

const extractDeadline = (message: string): string | null => {
  const match = message.match(/(\d{1,2}\s*月\s*\d{1,2}\s*(?:日|号)?前|本周内|下周前|月底前)/);
  return match ? normalizeText(match[0]) : null;
};

const extractConflictPolicy = (message: string): ScheduleSlots["conflictPolicy"] | undefined => {
  if (/冲突.*跳过|跳过.*冲突/.test(message)) return "skip";
  if (/可以重叠|允许重叠|允许冲突/.test(message)) return "allow-overlap";
  if (/冲突.*问我|问我.*冲突|有冲突就问/.test(message)) return "ask";
  if (/自动.*(重新安排|改期|避让)|冲突.*(重新安排|改期|避让)/.test(message)) return "reschedule";
  return undefined;
};

export const extractScheduleSlotsFromMessage = (userMessage: string): ScheduleSlots => {
  const message = normalizeText(userMessage);
  const slots: ScheduleSlots = {};
  const preferredTime = inferPreferredTime(message);
  const windows = extractTimeWindows(message);
  const dailyCapacity = extractDailyCapacity(message);
  const deadline = extractDeadline(message);
  const availableDays = extractAvailableDays(message);
  const conflictPolicy = extractConflictPolicy(message);

  if (preferredTime) slots.preferredTime = preferredTime;
  if (windows) slots.availableTimeWindows = windows;
  if (dailyCapacity) slots.dailyCapacity = dailyCapacity;
  if (deadline) slots.deadline = deadline;
  if (availableDays) slots.availableDays = availableDays;
  if (conflictPolicy) slots.conflictPolicy = conflictPolicy;

  return slots;
};

const slotHasValue = (slots: ScheduleSlots, key: ScheduleSlotKey): boolean => {
  switch (key) {
    case "sourceType":
      return slots.sourceType === "plan" || slots.sourceType === "checklist" || slots.sourceType === "manual";
    case "sourcePlanId":
      return isUsefulNumber(slots.sourcePlanId);
    case "sourceChecklistId":
      return isUsefulNumber(slots.sourceChecklistId);
    case "tasks":
      return mergeTasks(slots.tasks).length > 0;
    case "availableDays":
    case "excludedDates":
      return normalizeStringList(slots[key]).length > 0;
    case "availableTimeWindows":
      return mergeWindows(slots.availableTimeWindows).length > 0;
    default:
      return isUsefulString(slots[key]);
  }
};

const getKnownSlots = (slots: ScheduleSlots): ScheduleSlotKey[] =>
  SLOT_KEYS.filter((key) => slotHasValue(slots, key));

const hasExplicitScheduleCreateIntent = (
  message: string,
  explicitCreateIntent?: boolean,
): boolean => {
  if (explicitCreateIntent) return true;
  return /(保存到日程|创建日程|写入日程|就按这个日程创建|确认排入日程|确认创建日程|排入日程)/i.test(message);
};

const hasTaskSource = (slots: ScheduleSlots): boolean =>
  slotHasValue(slots, "tasks") ||
  slotHasValue(slots, "sourcePlanId") ||
  slotHasValue(slots, "sourceChecklistId");

const hasAvailableTimeContext = (slots: ScheduleSlots): boolean =>
  slotHasValue(slots, "availableTimeWindows") ||
  (slotHasValue(slots, "preferredTime") && slotHasValue(slots, "dailyCapacity")) ||
  (slotHasValue(slots, "availableDays") && slotHasValue(slots, "dailyCapacity"));

const buildMissingSlots = (slots: ScheduleSlots): ScheduleSlotKey[] => {
  const missing: ScheduleSlotKey[] = [];
  if (!hasTaskSource(slots)) missing.push("tasks");
  if (!slotHasValue(slots, "deadline")) missing.push("deadline");
  if (!hasAvailableTimeContext(slots)) {
    missing.push("availableTimeWindows", "dailyCapacity", "preferredTime");
  }
  if (!slotHasValue(slots, "conflictPolicy")) missing.push("conflictPolicy");
  if (!slotHasValue(slots, "priorityRule")) missing.push("priorityRule");
  return missing;
};

const buildSuggestedQuestions = (missingSlots: ScheduleSlotKey[]): string[] => {
  const missing = new Set(missingSlots);
  const questions: string[] = [];

  if (missing.has("tasks")) {
    questions.push("要安排哪些任务，或者从哪份计划 / 清单开始？");
  }
  if (missing.has("deadline")) {
    questions.push("你希望安排到哪段时间之前完成？");
  }
  if (missing.has("dailyCapacity")) {
    questions.push("每天或每周大概能投入多少时间？");
  }
  if (missing.has("availableTimeWindows") || missing.has("preferredTime")) {
    questions.push("通常希望安排在什么时间段，比如晚上、上午或周末？");
  }
  if (missing.has("conflictPolicy")) {
    questions.push("已有日程冲突时，是跳过、允许重叠，还是重新安排？");
  }
  if (missing.has("priorityRule")) {
    questions.push("是否优先安排高优先级 / 截止日期近的任务？");
  }

  return questions.slice(0, 5);
};

const uniqSlots = (slots: ScheduleSlotKey[]): ScheduleSlotKey[] =>
  mergeUnique(slots, (slot) => slot);

const createReadiness = (
  status: ScheduleReadinessStatus,
  knownSlots: ScheduleSlotKey[],
  missingSlots: ScheduleSlotKey[],
  reason: string,
): ScheduleReadiness => ({
  confidence:
    status === "confirmable"
      ? 0.9
      : status === "draftable"
        ? 0.82
        : 0.76,
  knownSlots,
  missingSlots,
  reason,
  status,
  suggestedQuestions: status === "insufficient" ? buildSuggestedQuestions(missingSlots) : [],
});

export const evaluateScheduleReadiness = (
  input: EvaluateScheduleReadinessInput,
): ScheduleReadiness => {
  const inferredSlots = extractScheduleSlotsFromMessage(input.userMessage);
  const mergedSessionAndInferred = mergeScheduleSlots(input.sessionSlots, inferredSlots);
  const slots = mergeScheduleSlots(mergedSessionAndInferred, input.slots);
  const knownSlots = getKnownSlots(slots);
  const missingSlots = uniqSlots(buildMissingSlots(slots));
  const explicitCreate = hasExplicitScheduleCreateIntent(input.userMessage, input.explicitCreateIntent);

  if (input.hasExistingDraft && explicitCreate) {
    return createReadiness(
      "confirmable",
      knownSlots,
      [],
      "已有日程草案且用户明确要求创建，可以进入确认准备阶段。",
    );
  }

  if (!hasTaskSource(slots)) {
    return createReadiness(
      "insufficient",
      knownSlots,
      missingSlots,
      "缺少可安排的任务来源，不能生成日程草案。",
    );
  }

  if (!hasAvailableTimeContext(slots)) {
    return createReadiness(
      "insufficient",
      knownSlots,
      missingSlots,
      slotHasValue(slots, "deadline")
        ? "已有任务和截止时间，但缺少可安排时间。"
        : "已有任务来源，但缺少可安排时间。",
    );
  }

  return createReadiness(
    "draftable",
    knownSlots,
    missingSlots.filter((slot) => slot === "conflictPolicy" || slot === "priorityRule"),
    "任务来源和可用时间已经足够生成日程草案，但不会写入日程。",
  );
};
