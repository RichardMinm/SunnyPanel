import type { Plan } from "@/payload-types";

import type { StatusBadgeTone } from "@/components/ui/SunnyComponents";
import type { WorkspaceSnapshot } from "@/lib/payload/workspace";
import type { ScheduleItemRecord, ScheduleItemStatus } from "@/lib/schedule/items";

export const quickCreateActions = [
  {
    description: "文章",
    href: "/admin/collections/posts/create",
    label: "新建文章",
  },
  {
    description: "短记",
    href: "/admin/collections/notes/create",
    label: "新建短札",
  },
  {
    description: "动态",
    href: "/admin/collections/updates/create",
    label: "新建动态",
  },
  {
    description: "节点",
    href: "/admin/collections/timeline-events/create",
    label: "新建时间线",
  },
  {
    description: "目标",
    href: "/admin/collections/plans/create",
    label: "新建计划",
  },
  {
    description: "任务",
    href: "/admin/collections/checklists/create",
    label: "新建清单",
  },
];

export const quickManageActions = [
  {
    href: "/admin/collections/pages/create",
    label: "新建页面",
  },
  {
    href: "/admin/collections/media/create",
    label: "上传媒体",
  },
  {
    href: "/admin",
    label: "打开 Admin",
  },
];

export const planColumns = [
  {
    actionLabel: "继续推进",
    empty: "还没有正在推进的计划。",
    key: "active",
    label: "正在推进",
  },
  {
    actionLabel: "安排启动",
    empty: "待开始计划会在这里排队。",
    key: "backlog",
    label: "待开始",
  },
  {
    actionLabel: "恢复评估",
    empty: "暂停计划会先停在这里。",
    key: "paused",
    label: "暂停中",
  },
] as const;

export const relationLabelMap: Record<string, string> = {
  checklists: "清单",
  notes: "短札",
  pages: "页面",
  posts: "文章",
  "timeline-events": "时间线",
  updates: "动态",
};

export const relationToneMap: Record<string, StatusBadgeTone> = {
  checklists: "warning",
  notes: "accent",
  pages: "info",
  posts: "success",
  "timeline-events": "danger",
  updates: "warning",
};

export const visibilityMetaMap: Record<"private" | "public", { label: string; tone: StatusBadgeTone }> = {
  private: { label: "私有", tone: "neutral" },
  public: { label: "公开", tone: "success" },
};

export const planPriorityLabelMap: Record<NonNullable<Plan["priority"]>, string> = {
  high: "高优先级",
  low: "低优先级",
  medium: "中优先级",
};

export const planPriorityToneMap: Record<NonNullable<Plan["priority"]>, StatusBadgeTone> = {
  high: "danger",
  low: "neutral",
  medium: "info",
};

export const planStatusLabelMap: Record<NonNullable<Plan["status"]>, string> = {
  draft: "草稿",
  published: "已发布",
};

export const planStatusToneMap: Record<NonNullable<Plan["status"]>, StatusBadgeTone> = {
  draft: "warning",
  published: "success",
};

export const planStateToneMap: Record<Plan["state"], StatusBadgeTone> = {
  active: "success",
  backlog: "warning",
  done: "neutral",
  paused: "accent",
};

export const scheduleStatusLabelMap: Record<ScheduleItemStatus, string> = {
  canceled: "已取消",
  done: "已完成",
  planned: "计划中",
  skipped: "已跳过",
};

export const scheduleStatusToneMap: Record<ScheduleItemStatus, StatusBadgeTone> = {
  canceled: "neutral",
  done: "success",
  planned: "info",
  skipped: "warning",
};

export const schedulePriorityToneMap: Record<ScheduleItemRecord["priority"], StatusBadgeTone> = {
  high: "danger",
  low: "neutral",
  medium: "info",
};

export type LinkedContentItem = NonNullable<Plan["linkedContent"]>[number];
export type FocusMetricKey = "drafts" | "planOutputs" | "timeline";

export type FocusItem = {
  actionLabel: string;
  href: string;
  metricKey?: FocusMetricKey;
  summary: string;
  title: string;
  tone: StatusBadgeTone;
};

export type QueueDescriptor = {
  actionHref: string;
  actionLabel: string;
  empty: string;
  items: WorkspaceSnapshot["execution"]["recentEdited"];
  kicker: string;
  title: string;
};

export const dayInMs = 1000 * 60 * 60 * 24;
