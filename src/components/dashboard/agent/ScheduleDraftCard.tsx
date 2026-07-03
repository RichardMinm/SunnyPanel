"use client";

import { AppBadge } from "@/components/primitives/AppBadge";
import { AppButton } from "@/components/primitives/AppButton";
import { AppCard } from "@/components/primitives/AppCard";
import { AppPanel } from "@/components/primitives/AppPanel";
import type { ScheduleDraft, ScheduleDraftItem } from "@/lib/agent/schedule/draft";
import { cn } from "@/lib/ui/cn";

export type ScheduleDraftCardProps = {
  className?: string;
  draft: ScheduleDraft;
  onPrepareCreate?: () => void;
  onRevise?: () => void;
};

const fallback = "待补充";

const sourceTypeLabelMap: Record<ScheduleDraft["sourceType"], string> = {
  checklist: "清单",
  manual: "手动",
  plan: "计划",
};

const formatTimeRange = (item: ScheduleDraftItem): string => {
  if (item.startTime && item.endTime) {
    return `${item.startTime} - ${item.endTime}`;
  }

  return item.startTime || item.endTime || "时间待定";
};

const countDates = (items: ScheduleDraftItem[]): number => {
  const dates = new Set(items.map((item) => item.date?.trim()).filter(Boolean));
  return dates.size;
};

function ScheduleDraftHeader({ draft }: { draft: ScheduleDraft }) {
  return (
    <div className="sunny-schedule-draft-header">
      <div className="sunny-schedule-draft-header-main">
        <AppBadge tone="accent">日程草案</AppBadge>
        <h3>{draft.title}</h3>
      </div>
      <p>尚未写入日程，可以继续调整。准备创建时会再次检查本地冲突。</p>
    </div>
  );
}

function ScheduleDraftMeta({ draft }: { draft: ScheduleDraft }) {
  return (
    <dl className="sunny-schedule-draft-meta" aria-label="日程草案基本信息">
      <div>
        <dt>来源</dt>
        <dd>{sourceTypeLabelMap[draft.sourceType]}</dd>
      </div>
      <div>
        <dt>来源计划</dt>
        <dd>{draft.sourcePlanId ?? fallback}</dd>
      </div>
      <div>
        <dt>来源清单</dt>
        <dd>{draft.sourceChecklistId ?? fallback}</dd>
      </div>
      <div>
        <dt>日程项数量</dt>
        <dd>{draft.items.length}</dd>
      </div>
      <div>
        <dt>涉及日期</dt>
        <dd>{countDates(draft.items) || fallback}</dd>
      </div>
      <div>
        <dt>冲突提示</dt>
        <dd>{draft.conflicts?.length ? "需要确认" : "暂无"}</dd>
      </div>
    </dl>
  );
}

function ScheduleDraftItemRow({ item }: { item: ScheduleDraftItem }) {
  return (
    <li className="sunny-schedule-draft-item">
      <div className="sunny-schedule-draft-item-main">
        <h4>{item.title}</h4>
        {item.sourceTaskTitle ? <p>{item.sourceTaskTitle}</p> : null}
      </div>
      <div className="sunny-schedule-draft-item-meta">
        <span>{item.date || "日期待定"}</span>
        <span>{formatTimeRange(item)}</span>
        {item.estimatedMinutes ? <span>约 {item.estimatedMinutes} 分钟</span> : null}
      </div>
      {item.conflictNote ? <p className="sunny-schedule-draft-item-note">{item.conflictNote}</p> : null}
    </li>
  );
}

function ScheduleDraftItems({ draft }: { draft: ScheduleDraft }) {
  return (
    <section className="sunny-schedule-draft-section" aria-label="日程草案条目">
      <h4>日程项</h4>
      <ol className="sunny-schedule-draft-items">
        {draft.items.map((item, index) => (
          <ScheduleDraftItemRow key={`${item.title}-${index}`} item={item} />
        ))}
      </ol>
    </section>
  );
}

function ScheduleDraftMutedList({
  ariaLabel,
  items,
  title,
}: {
  ariaLabel: string;
  items?: string[];
  title: string;
}) {
  if (!items?.length) {
    return null;
  }

  return (
    <AppPanel className="sunny-schedule-draft-muted-panel" variant="quiet" aria-label={ariaLabel}>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </AppPanel>
  );
}

function ScheduleDraftActions({
  onPrepareCreate,
  onRevise,
}: Pick<ScheduleDraftCardProps, "onPrepareCreate" | "onRevise">) {
  return (
    <div className="sunny-schedule-draft-actions" role="toolbar" aria-label="日程草案操作">
      <AppButton disabled={!onRevise} onClick={onRevise} size="sm" type="button" variant="outline">
        继续修改
      </AppButton>
      <AppButton disabled={!onPrepareCreate} onClick={onPrepareCreate} size="sm" type="button" variant="secondary">
        准备创建日程
      </AppButton>
    </div>
  );
}

export function ScheduleDraftCard({
  className,
  draft,
  onPrepareCreate,
  onRevise,
}: ScheduleDraftCardProps) {
  return (
    <AppCard
      className={cn("sunny-schedule-draft-card", className)}
      padding="none"
      role="group"
      variant="quiet"
      aria-label="日程草案"
    >
      <ScheduleDraftHeader draft={draft} />
      <ScheduleDraftMeta draft={draft} />
      <ScheduleDraftItems draft={draft} />
      <div className="sunny-schedule-draft-context-grid">
        <ScheduleDraftMutedList ariaLabel="日程草案假设" items={draft.assumptions} title="基于以下假设" />
        <ScheduleDraftMutedList ariaLabel="日程草案冲突提示" items={draft.conflicts} title="冲突提示" />
      </div>
      <ScheduleDraftActions onPrepareCreate={onPrepareCreate} onRevise={onRevise} />
    </AppCard>
  );
}
