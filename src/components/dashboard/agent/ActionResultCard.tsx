"use client";

import { AppBadge } from "@/components/primitives/AppBadge";
import { AppCard } from "@/components/primitives/AppCard";
import { cn } from "@/lib/ui/cn";

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
  }
};

const buildRows = (data: ActionResultData): ResultRow[] => {
  switch (data.kind) {
    case "plan_created":
      return [
        { label: "记录", value: "Plans 已写入" },
        { label: "后续", value: "可继续拆成清单" },
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
          label: "Timeline",
          value: data.timelineStatus === "synced" ? "已记录/更新" : "未检测到同步结果",
        },
      ];
  }
};

const buildResultNotes = (data: ActionResultData) => {
  switch (data.kind) {
    case "plan_created":
      return ["计划记录已经落库。", "下一步可以继续拆成清单。"];
    case "checklist_created":
      return [
        "清单记录已经落库。",
        data.linkedPlanId ? `已写回计划关联：#${data.linkedPlanId}。` : "这次结果没有检测到计划关联。",
      ];
    case "checklist_item_completed":
      return [
        "清单条目已经标记完成。",
        data.timelineStatus === "synced" ? "Timeline 节点已记录/更新。" : "没有检测到 Timeline 同步结果。",
      ];
  }
};

export function ActionResultCard({ className, data }: ActionResultCardProps) {
  const rows = buildRows(data);
  const notes = buildResultNotes(data);
  const rollbackLabel = data.rollbackAvailable ? "可回滚" : "未提供回滚";

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
        <AppBadge tone="success">已执行</AppBadge>
      </div>

      <div className="sunny-agent-result-card-grid" aria-label="执行结果详情">
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>

      <ul className="sunny-action-result-card-notes" aria-label="执行结果说明">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>

      <div className="sunny-action-result-card-footer">
        <AppBadge tone={data.rollbackAvailable ? "success" : "muted"}>{rollbackLabel}</AppBadge>
        <span>{data.rollbackAvailable ? "可从本轮操作记录撤销。" : "本轮没有返回自动回滚信息。"}</span>
      </div>
    </AppCard>
  );
}
