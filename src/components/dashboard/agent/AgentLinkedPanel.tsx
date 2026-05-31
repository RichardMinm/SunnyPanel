"use client";

import type { DashboardLinkedObject } from "@/lib/dashboard/placeholder-interfaces";
import { stubLinkedObjects } from "@/lib/dashboard/placeholder-interfaces";

type AgentLinkedPanelProps = {
  linkedObjects?: DashboardLinkedObject[];
};

const collectionLabelMap: Record<string, string> = {
  plans: "计划",
  checklists: "清单",
  "schedule-items": "日程",
  posts: "文章",
  notes: "短札",
  "timeline-events": "时间线",
  "agent-memories": "记忆",
};

export function AgentLinkedPanel({ linkedObjects = stubLinkedObjects }: AgentLinkedPanelProps) {
  if (linkedObjects.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted">
        <p>暂无关联对象</p>
        <p className="mt-1 text-xs">
          当 Agent 对话关联到计划、日程、文章等对象时，会在此显示。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-3">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider">
        关联对象 ({linkedObjects.length})
      </p>
      {linkedObjects.map((obj) => (
        <a
          key={obj.id}
          href={obj.href}
          className="flex items-center justify-between rounded-md border border-border/60 bg-surface p-2.5 hover:bg-surface-strong transition-colors"
        >
          <div className="min-w-0">
            <span className="text-xs text-muted">
              {collectionLabelMap[obj.collection] ?? obj.collection}
            </span>
            <p className="truncate text-sm font-medium text-foreground">{obj.title}</p>
          </div>
          {obj.status ? (
            <span className="shrink-0 rounded-full bg-surface-strong px-2 py-0.5 text-xs text-muted">
              {obj.status}
            </span>
          ) : null}
        </a>
      ))}
    </div>
  );
}
