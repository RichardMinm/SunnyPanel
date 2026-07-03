"use client";

import { AppBadge } from "@/components/primitives/AppBadge";
import { AppButton } from "@/components/primitives/AppButton";
import { AppCard } from "@/components/primitives/AppCard";
import { AppPanel } from "@/components/primitives/AppPanel";
import type {
  ChecklistDraft,
  ChecklistDraftGroup,
  ChecklistDraftItem,
} from "@/lib/agent/planning/checklist-draft";
import { cn } from "@/lib/ui/cn";

export type ChecklistDraftCardProps = {
  className?: string;
  draft: ChecklistDraft;
  onPrepareCreate?: () => void;
  onRevise?: () => void;
};

const fallback = "待补充";

const priorityLabelMap = {
  high: "高",
  low: "低",
  medium: "中",
} as const;

function countItems(draft: ChecklistDraft): number {
  return draft.groups.reduce((count, group) => count + group.items.length, 0);
}

function ChecklistDraftHeader({ draft }: { draft: ChecklistDraft }) {
  return (
    <div className="sunny-checklist-draft-header">
      <div className="sunny-checklist-draft-header-main">
        <AppBadge tone="accent">清单草案</AppBadge>
        <h3>{draft.title}</h3>
      </div>
      <p>尚未写入数据库，可继续修改。</p>
    </div>
  );
}

function ChecklistDraftMeta({ draft }: { draft: ChecklistDraft }) {
  return (
    <dl className="sunny-checklist-draft-meta" aria-label="清单草案基本信息">
      <div>
        <dt>来源计划</dt>
        <dd>{draft.sourcePlanTitle || fallback}</dd>
      </div>
      <div>
        <dt>目标</dt>
        <dd>{draft.goal || fallback}</dd>
      </div>
      <div>
        <dt>分组数</dt>
        <dd>{draft.groups.length}</dd>
      </div>
      <div>
        <dt>条目数</dt>
        <dd>{countItems(draft)}</dd>
      </div>
    </dl>
  );
}

function ChecklistDraftItemRow({ item }: { item: ChecklistDraftItem }) {
  return (
    <li className="sunny-checklist-draft-item">
      <span>{item.title}</span>
      {item.priority ? (
        <small>{priorityLabelMap[item.priority]}</small>
      ) : null}
      {item.description ? <p>{item.description}</p> : null}
    </li>
  );
}

function ChecklistDraftGroupItem({ group }: { group: ChecklistDraftGroup }) {
  return (
    <li className="sunny-checklist-draft-group">
      <div className="sunny-checklist-draft-group-head">
        <h4>{group.title}</h4>
        {group.description ? <p>{group.description}</p> : null}
      </div>
      <ul className="sunny-checklist-draft-items">
        {group.items.map((item, index) => (
          <ChecklistDraftItemRow key={`${item.title}-${index}`} item={item} />
        ))}
      </ul>
    </li>
  );
}

function ChecklistDraftGroups({ draft }: { draft: ChecklistDraft }) {
  return (
    <section className="sunny-checklist-draft-section" aria-label="清单草案分组">
      <h4>分组与条目</h4>
      <ol className="sunny-checklist-draft-groups">
        {draft.groups.map((group, index) => (
          <ChecklistDraftGroupItem key={`${group.title}-${index}`} group={group} />
        ))}
      </ol>
    </section>
  );
}

function ChecklistDraftAssumptions({ draft }: { draft: ChecklistDraft }) {
  if (!draft.assumptions?.length) {
    return null;
  }

  return (
    <AppPanel className="sunny-checklist-draft-muted-panel" variant="quiet" aria-label="清单草案假设">
      <h4>基于以下假设</h4>
      <ul>
        {draft.assumptions.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </AppPanel>
  );
}

function ChecklistDraftActions({
  onPrepareCreate,
  onRevise,
}: Pick<ChecklistDraftCardProps, "onPrepareCreate" | "onRevise">) {
  return (
    <div className="sunny-checklist-draft-actions" role="toolbar" aria-label="清单草案操作">
      <AppButton disabled={!onRevise} onClick={onRevise} size="sm" type="button" variant="outline">
        继续修改
      </AppButton>
      <AppButton disabled={!onPrepareCreate} onClick={onPrepareCreate} size="sm" type="button" variant="secondary">
        准备创建清单
      </AppButton>
    </div>
  );
}

export function ChecklistDraftCard({
  className,
  draft,
  onPrepareCreate,
  onRevise,
}: ChecklistDraftCardProps) {
  return (
    <AppCard
      className={cn("sunny-checklist-draft-card", className)}
      padding="none"
      role="group"
      variant="quiet"
      aria-label="清单草案"
    >
      <ChecklistDraftHeader draft={draft} />
      <ChecklistDraftMeta draft={draft} />
      <ChecklistDraftGroups draft={draft} />
      <ChecklistDraftAssumptions draft={draft} />
      <ChecklistDraftActions onPrepareCreate={onPrepareCreate} onRevise={onRevise} />
    </AppCard>
  );
}
