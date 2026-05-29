import type {
  ComposeScheduleItemArgs,
  PlanPriorityValue,
  ScheduleConflict,
  ScheduleProposal,
} from "../schemas";

type ScheduleComposerPlanCandidate = {
  id?: null | number;
  priority?: null | string;
  state?: null | string;
  title: string;
};

type ScheduleConflictSource = {
  endTime?: null | string;
  id: number;
  startTime?: null | string;
  title: string;
};

export type ScheduleComposerContext = {
  conflicts?: ScheduleConflict[];
  now?: string;
  planCandidates?: ScheduleComposerPlanCandidate[];
};

const dayInMs = 24 * 60 * 60 * 1000;
const weekdayMap: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
};

const chineseHourMap: Record<string, number> = {
  一: 1,
  七: 7,
  三: 3,
  九: 9,
  二: 2,
  五: 5,
  八: 8,
  六: 6,
  十: 10,
  四: 4,
  零: 0,
};

const normalizeText = (value: null | string | undefined) => value?.trim().replace(/\s+/g, " ") ?? "";

const compactText = (value: string, maxLength: number) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength).trimEnd()}...`;

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const parseNow = (now?: string) => {
  const parsed = now ? new Date(now) : new Date();

  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * dayInMs);

const nextWeekday = (now: Date, targetWeekday: number) => {
  const current = now.getDay();
  let delta = (targetWeekday - current + 7) % 7;

  if (delta === 0) {
    delta = 7;
  }

  return addDays(now, delta);
};

const parseExplicitDate = (text: string) => {
  const isoMatch = text.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);

  if (!isoMatch) {
    return null;
  }

  const [, year, month, day] = isoMatch;

  return `${year}-${String(Number(month)).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
};

export const inferScheduleDate = (text: string, nowInput?: string) => {
  const explicit = parseExplicitDate(text);

  if (explicit) {
    return explicit;
  }

  const now = parseNow(nowInput);

  if (/(今天|今日|今晚|今早|上午|下午|晚上)/.test(text) && !/(明天|后天|下周)/.test(text)) {
    return toLocalDateKey(now);
  }

  if (/(明天|明早|明晚)/.test(text)) {
    return toLocalDateKey(addDays(now, 1));
  }

  if (/后天/.test(text)) {
    return toLocalDateKey(addDays(now, 2));
  }

  const nextWeekMatch = text.match(/下周([一二三四五六日天])/);

  if (nextWeekMatch) {
    return toLocalDateKey(nextWeekday(now, weekdayMap[nextWeekMatch[1] ?? "一"] ?? 1));
  }

  const weekdayMatch = text.match(/(?:周|星期)([一二三四五六日天])/);

  if (weekdayMatch) {
    return toLocalDateKey(nextWeekday(now, weekdayMap[weekdayMatch[1] ?? "一"] ?? 1));
  }

  return null;
};

const parseDurationMinutes = (text: string) => {
  const minuteMatch = text.match(/(\d+)\s*分钟/);

  if (minuteMatch) {
    return Number(minuteMatch[1]);
  }

  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|个小时|h)/i);

  if (hourMatch) {
    return Math.round(Number(hourMatch[1]) * 60);
  }

  return 90;
};

const formatTime = (minutes: number) => {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, minutes));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const parseChineseHour = (value: string) => {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  if (value === "十二") {
    return 12;
  }

  if (value.startsWith("十")) {
    return 10 + (chineseHourMap[value.slice(1)] ?? 0);
  }

  if (value.endsWith("十")) {
    return (chineseHourMap[value[0] ?? ""] ?? 0) * 10;
  }

  if (value.includes("十")) {
    const [left, right] = value.split("十");

    return (chineseHourMap[left ?? ""] ?? 1) * 10 + (chineseHourMap[right ?? ""] ?? 0);
  }

  return chineseHourMap[value] ?? null;
};

const inferStartMinutes = (text: string) => {
  const explicit = text.match(/([01]?\d|2[0-3])[:：]([0-5]\d)/);

  if (explicit) {
    return Number(explicit[1]) * 60 + Number(explicit[2]);
  }

  const hourMatch = text.match(/(上午|早上|下午|晚上|今晚|中午)?\s*([零一二三四五六七八九十\d]{1,3})点/);

  if (hourMatch) {
    const meridiem = hourMatch[1] ?? "";
    const hour = parseChineseHour(hourMatch[2] ?? "");

    if (hour !== null) {
      const adjustedHour =
        /(下午|晚上|今晚)/.test(meridiem) && hour < 12
          ? hour + 12
          : /中午/.test(meridiem) && hour < 11
            ? hour + 12
            : hour;

      return adjustedHour * 60;
    }
  }

  if (/(今晚|晚上)/.test(text)) {
    return 19 * 60 + 30;
  }

  if (/(下午|午后)/.test(text)) {
    return 14 * 60;
  }

  if (/(上午|早上|明早|今早)/.test(text)) {
    return 9 * 60;
  }

  if (/中午/.test(text)) {
    return 12 * 60;
  }

  return 9 * 60;
};

const inferTimeRange = (args: ComposeScheduleItemArgs) => {
  const source = normalizeText(args.sourceText);
  const explicitStart = normalizeText(args.startTime);
  const explicitEnd = normalizeText(args.endTime);
  const isAllDay = args.isAllDay === true || /全天|整天/.test(source);

  if (isAllDay) {
    return {
      endTime: null,
      isAllDay: true,
      startTime: null,
    };
  }

  if (explicitStart && explicitEnd) {
    return {
      endTime: explicitEnd,
      isAllDay: false,
      startTime: explicitStart,
    };
  }

  const startMinutes = explicitStart ? inferStartMinutes(explicitStart) : inferStartMinutes(source);
  const duration = parseDurationMinutes(source);

  return {
    endTime: explicitEnd || formatTime(startMinutes + duration),
    isAllDay: false,
    startTime: explicitStart || formatTime(startMinutes),
  };
};

const inferTitle = (args: ComposeScheduleItemArgs, planCandidates: ScheduleComposerPlanCandidate[]) => {
  const explicit = normalizeText(args.title);

  if (explicit) {
    return compactText(explicit, 72);
  }

  const relatedPlan = args.relatedPlanId
    ? planCandidates.find((plan) => plan.id === args.relatedPlanId)
    : planCandidates.find((plan) => plan.state === "active") ?? planCandidates[0];

  if (relatedPlan && /(安排今天|帮我安排今天|今天安排|排一下今天)/.test(normalizeText(args.sourceText))) {
    return compactText(`推进：${relatedPlan.title}`, 72);
  }

  const cleaned = normalizeText(args.sourceText)
    .replace(/^(帮我|请|把|将|给)?/, "")
    .replace(/(安排|排到|放到|日程|今天|明天|上午|下午|晚上|今晚|下周[一二三四五六日天]|[0-9零一二三四五六七八九十]+点|[0-9]+分钟)/g, "")
    .replace(/[：:，,。]/g, " ")
    .trim();

  return compactText(cleaned || "专注推进一个计划动作", 72);
};

const inferPriority = (args: ComposeScheduleItemArgs, planCandidates: ScheduleComposerPlanCandidate[]): PlanPriorityValue => {
  if (args.priority) {
    return args.priority;
  }

  const relatedPlan = args.relatedPlanId
    ? planCandidates.find((plan) => plan.id === args.relatedPlanId)
    : planCandidates[0];

  if (relatedPlan?.priority === "high" || relatedPlan?.priority === "low" || relatedPlan?.priority === "medium") {
    return relatedPlan.priority;
  }

  return /(紧急|重要|今天必须|高优先)/.test(normalizeText(args.sourceText)) ? "high" : "medium";
};

export const isScheduleComposerDateAmbiguous = (args: ComposeScheduleItemArgs, now?: string) =>
  !normalizeText(args.date) && !inferScheduleDate(normalizeText(args.sourceText), now);

export const toScheduleConflicts = (
  items: ScheduleConflictSource[],
): ScheduleConflict[] =>
  items.map((item) => ({
    endTime: item.endTime ?? null,
    scheduleItemId: item.id,
    startTime: item.startTime ?? null,
    title: item.title,
  }));

export const composeScheduleProposalAsync = async (
  args: ComposeScheduleItemArgs,
  context: ScheduleComposerContext = {},
): Promise<ScheduleProposal> => {
  let enrichedArgs = args;

  if (normalizeText(args.sourceText)) {
    const { inferScheduleTimeWithLLM } = await import("./schedule-time-llm");
    const llmParsed = await inferScheduleTimeWithLLM(
      normalizeText(args.sourceText),
      context.now ?? new Date().toISOString(),
    );

    if (llmParsed && llmParsed.confidence >= 0.45) {
      enrichedArgs = {
        ...args,
        date: args.date ?? llmParsed.date ?? undefined,
        endTime: args.endTime ?? llmParsed.endTime ?? undefined,
        isAllDay: args.isAllDay ?? llmParsed.isAllDay,
        startTime: args.startTime ?? llmParsed.startTime ?? undefined,
      };
    }
  }

  return composeScheduleProposal(enrichedArgs, context);
};

export const composeScheduleProposal = (
  args: ComposeScheduleItemArgs,
  context: ScheduleComposerContext = {},
): ScheduleProposal => {
  if (args.proposal) {
    return {
      ...args.proposal,
      conflicts: context.conflicts ?? args.proposal.conflicts ?? [],
    };
  }

  const sourceText = normalizeText(args.sourceText);
  const planCandidates = context.planCandidates ?? [];
  const title = inferTitle(args, planCandidates);
  const date = normalizeText(args.date) || inferScheduleDate(sourceText, context.now) || "";
  const timeRange = inferTimeRange(args);
  const relatedPlan = args.relatedPlanId
    ? args.relatedPlanId
    : /(安排今天|帮我安排今天|今天安排|排一下今天)/.test(sourceText)
      ? planCandidates.find((plan) => plan.state === "active")?.id ?? planCandidates[0]?.id ?? null
      : null;

  return {
    conflicts: context.conflicts ?? [],
    date,
    description: normalizeText(args.description) || (sourceText ? compactText(sourceText, 180) : null),
    endTime: timeRange.endTime,
    isAllDay: timeRange.isAllDay,
    priority: inferPriority(args, planCandidates),
    reason:
      normalizeText(args.reason) ||
      (relatedPlan
        ? "这条日程把计划推进落到具体日期和时间块里，方便当天执行和复盘。"
        : "这条日程把临时意图转成可确认的每日行动。"),
    relatedChecklistId: args.relatedChecklistId ?? null,
    relatedChecklistItemKey: normalizeText(args.relatedChecklistItemKey) || null,
    relatedPlanId: relatedPlan ?? null,
    startTime: timeRange.startTime,
    title,
  };
};
