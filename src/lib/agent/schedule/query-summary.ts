export type ScheduleQueryRelation = null | number | {
  id?: number;
  title?: null | string;
};

export type ScheduleQueryItem = {
  date?: null | string;
  endTime?: null | string;
  id?: null | number;
  priority?: null | string;
  relatedChecklist?: ScheduleQueryRelation;
  relatedPlan?: ScheduleQueryRelation;
  startTime?: null | string;
  status?: null | string;
  title?: null | string;
};

export type FormatScheduleQueryAssistantMessageInput = {
  rangeLabel?: null | string;
  schedules?: ScheduleQueryItem[] | null;
  limit?: number;
};

const normalizeText = (value: null | string | undefined): string =>
  value?.trim().replace(/\s+/g, " ") ?? "";

const normalizeDate = (value: null | string | undefined): string => {
  const text = normalizeText(value);

  return text.includes("T") ? text.slice(0, 10) : text;
};

const relationLabel = (label: string, relation: ScheduleQueryRelation | undefined): string | null => {
  if (typeof relation === "number") return `${label} #${relation}`;
  if (relation?.title) return `${label}「${relation.title}」`;
  if (typeof relation?.id === "number") return `${label} #${relation.id}`;
  return null;
};

const formatTime = (item: ScheduleQueryItem): string => {
  const start = normalizeText(item.startTime);
  const end = normalizeText(item.endTime);

  if (start && end) return `${start}-${end}`;
  if (start) return start;
  if (end) return `截至 ${end}`;
  return "全天 / 未指定时间";
};

const formatScheduleLine = (item: ScheduleQueryItem): string => {
  const title = normalizeText(item.title) || "未命名日程";
  const status = normalizeText(item.status);
  const priority = normalizeText(item.priority);
  const relations = [
    relationLabel("计划", item.relatedPlan),
    relationLabel("清单", item.relatedChecklist),
  ].filter(Boolean);
  const meta = [
    status ? `状态：${status}` : null,
    priority ? `优先级：${priority}` : null,
    ...relations,
  ].filter(Boolean);

  return `- ${formatTime(item)} ${title}${meta.length > 0 ? `（${meta.join("，")}）` : ""}`;
};

const formatEmptyScheduleMessage = (rangeLabel: string): string => {
  const label = normalizeText(rangeLabel);

  if (label === "今天") return "今天没有已安排的日程。";
  if (label === "明天") return "明天没有已安排的日程。";
  if (label === "本周") return "本周没有已安排的日程。";
  if (label === "下周") return "下周没有已安排的日程。";
  if (/未来\s*7\s*天/.test(label)) return "未来 7 天没有已安排的日程。";
  if (/最近|近期/.test(label)) return "最近没有已安排的日程。";

  return "没有找到已安排的日程。";
};

export const inferScheduleQueryRangeLabel = (message: string): string => {
  if (/今天|today/i.test(message)) return "今天";
  if (/明天|tomorrow/i.test(message)) return "明天";
  if (/下周|next week/i.test(message)) return "下周";
  if (/本周|这周|this week/i.test(message)) return "本周";
  if (/最近|近期|upcoming|recent/i.test(message)) return "最近 / 未来 7 天";
  return "未来 7 天";
};

export const formatScheduleQueryAssistantMessage = ({
  limit = 10,
  rangeLabel,
  schedules,
}: FormatScheduleQueryAssistantMessageInput): string => {
  const label = normalizeText(rangeLabel) || "最近 / 未来 7 天";
  const items = [...(schedules ?? [])]
    .filter((item) => normalizeText(item.title) || normalizeText(item.date))
    .sort((left, right) => {
      const leftKey = `${normalizeDate(left.date)} ${normalizeText(left.startTime)}`;
      const rightKey = `${normalizeDate(right.date)} ${normalizeText(right.startTime)}`;

      return leftKey.localeCompare(rightKey);
    })
    .slice(0, limit);

  if (items.length === 0) {
    return `${formatEmptyScheduleMessage(label)}\n\n范围：${label}。这次只是查询现有日程，没有创建或修改任何日程项。`;
  }

  const grouped = new Map<string, ScheduleQueryItem[]>();
  for (const item of items) {
    const date = normalizeDate(item.date) || "未指定日期";
    grouped.set(date, [...(grouped.get(date) ?? []), item]);
  }

  const groups = Array.from(grouped.entries()).map(([date, dateItems]) =>
    [`${date}`, ...dateItems.map(formatScheduleLine)].join("\n")
  );

  const hiddenCount = (schedules?.length ?? 0) - items.length;
  const moreLine = hiddenCount > 0 ? `\n\n还有 ${hiddenCount} 个日程项未展开显示。` : "";

  return [
    `这是${label}的日程摘要，共 ${schedules?.length ?? items.length} 个日程项：`,
    groups.join("\n\n"),
    `${moreLine}\n\n这次只是查看日程，不会创建、修改或写入 schedule-items。`,
  ].join("\n\n");
};
