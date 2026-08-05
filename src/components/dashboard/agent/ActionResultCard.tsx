"use client";

import { AppBadge } from "@/components/primitives/AppBadge";
import { AppCard } from "@/components/primitives/AppCard";
import { cn } from "@/lib/ui/cn";

import { AgentResultDelivery } from "./AgentResultDelivery";
import type { ActionResultData } from "./utils";

type ActionResultCardProps = {
  className?: string;
  data: ActionResultData;
};

type ResultRow = {
  label: string;
  value: string;
};

const getTitle = (data: ActionResultData) => {
  switch (data.kind) {
    case "plan_created":
      return "计划已创建";
    case "checklist_created":
      return "清单已创建";
    case "checklist_item_completed":
      return "清单项已完成";
    case "schedule_items_created":
      return "已创建日程";
  }
};

const getAriaLabel = (data: ActionResultData) => {
  switch (data.kind) {
    case "plan_created":
      return "计划创建结果";
    case "checklist_created":
      return "清单创建结果";
    case "checklist_item_completed":
      return "清单项完成结果";
    case "schedule_items_created":
      return "日程创建结果";
  }
};

const formatScheduleIds = (ids: number[] | undefined): string => {
  if (!ids || ids.length === 0) {
    return "已记录";
  }

  const visibleIds = ids.slice(0, 5).map((id) => `#${id}`).join(", ");

  return ids.length > 5 ? `${visibleIds}，等 ${ids.length} 个` : visibleIds;
};

const buildRows = (data: ActionResultData): ResultRow[] => {
  switch (data.kind) {
    case "plan_created":
      return [
        { label: "保存位置", value: "计划" },
        { label: "接下来", value: "可以继续拆成清单" },
      ];
    case "checklist_created":
      return [
        {
          label: "分组",
          value: data.groupsCount != null ? `${data.groupsCount} 个分组` : "已创建",
        },
        {
          label: "条目",
          value: data.itemsCount != null ? `${data.itemsCount} 个条目` : "已创建",
        },
        {
          label: "计划关联",
          value: data.linkedPlanId ? `已关联到计划 #${data.linkedPlanId}` : "暂未关联计划",
        },
      ];
    case "checklist_item_completed":
      return [
        {
          label: "清单",
          value: data.checklistTitle ?? "已更新",
        },
        ...(data.groupTitle ? [{ label: "分组", value: data.groupTitle }] : []),
        {
          label: "时间线",
          value: data.timelineStatus === "synced" ? "已记录/更新" : "未检测到同步结果",
        },
      ];
    case "schedule_items_created":
      return [
        {
          label: "日程项数量",
          value: data.itemsCount != null ? `${data.itemsCount} 个日程项` : "已创建",
        },
        {
          label: "日期范围",
          value: data.dateRange ?? "已写入日程",
        },
        {
          label: "来源计划",
          value: data.sourcePlanId ? `来源计划 #${data.sourcePlanId}` : "未关联计划",
        },
        {
          label: "来源清单",
          value: data.sourceChecklistId ? `来源清单 #${data.sourceChecklistId}` : "未关联清单",
        },
        {
          label: "创建记录",
          value: formatScheduleIds(data.createdScheduleItemIds),
        },
      ];
  }
};

const getDeliveryProps = (data: ActionResultData) => {
  switch (data.kind) {
    case "plan_created":
      return { statusLabel: "计划已保存", workspace: "plan" as const };
    case "checklist_created":
      return { statusLabel: "清单已保存", workspace: "checklist" as const };
    case "checklist_item_completed":
      return { statusLabel: "完成状态已保存", workspace: "checklist" as const };
    case "schedule_items_created":
      return { statusLabel: "日程已保存", workspace: "schedule" as const };
  }
};

export function ActionResultCard({ className, data }: ActionResultCardProps) {
  const rows = buildRows(data);
  const delivery = getDeliveryProps(data);
  const previewItems = data.kind === "schedule_items_created"
    ? data.scheduleItemPreviews?.slice(0, 5) ?? []
    : [];

  return (
    <AppCard
      className={cn(
        "sunny-agent-result-card sunny-action-result-card",
        `sunny-action-result-card-${data.kind}`,
        className,
      )}
      padding="none"
      role="group"
      variant="quiet"
      aria-label={getAriaLabel(data)}
    >
      <div className="sunny-action-result-card-header">
        <div>
          <p className="sunny-agent-result-card-kicker">{getTitle(data)}</p>
          <h3>{data.title}</h3>
        </div>
        <AppBadge tone="success">完成</AppBadge>
      </div>

      <div className="sunny-agent-result-card-grid" aria-label="执行结果详情">
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>

      {previewItems.length > 0 ? (
        <ul className="sunny-action-result-card-preview-list" aria-label="日程项摘要">
          {previewItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      <AgentResultDelivery
        rollbackAvailable={data.rollbackAvailable}
        statusLabel={delivery.statusLabel}
        workspace={delivery.workspace}
      />
    </AppCard>
  );
}
