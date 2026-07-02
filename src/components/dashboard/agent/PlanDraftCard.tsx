"use client";

import { AppBadge } from "@/components/primitives/AppBadge";
import { AppButton } from "@/components/primitives/AppButton";
import { AppCard } from "@/components/primitives/AppCard";
import { AppPanel } from "@/components/primitives/AppPanel";
import type { PlanDraft, PlanDraftStage } from "@/lib/agent/planning/draft";
import { cn } from "@/lib/ui/cn";

export type PlanDraftCardProps = {
  className?: string;
  draft: PlanDraft;
  onGenerateChecklist?: () => void;
  onPrepareCreate?: () => void;
  onRevise?: () => void;
};

const fallback = "待补充";

const metaLabelMap: Array<{
  key: keyof Pick<
    PlanDraft,
    "availableTime" | "currentProgress" | "deadline" | "goal" | "scope" | "successCriteria"
  >;
  label: string;
}> = [
  { key: "goal", label: "目标" },
  { key: "deadline", label: "截止时间" },
  { key: "scope", label: "范围" },
  { key: "currentProgress", label: "当前进度" },
  { key: "availableTime", label: "可投入时间" },
  { key: "successCriteria", label: "验收标准" },
];

function PlanDraftHeader({ draft }: { draft: PlanDraft }) {
  return (
    <div className="sunny-plan-draft-header">
      <div className="sunny-plan-draft-header-main">
        <AppBadge tone="accent">计划草案</AppBadge>
        <h3>{draft.title}</h3>
      </div>
      <p>尚未写入数据库，可继续修改。</p>
    </div>
  );
}

function PlanDraftMeta({ draft }: { draft: PlanDraft }) {
  return (
    <dl className="sunny-plan-draft-meta" aria-label="计划草案基本信息">
      {metaLabelMap.map((item) => (
        <div key={item.key}>
          <dt>{item.label}</dt>
          <dd>{draft[item.key] || fallback}</dd>
        </div>
      ))}
    </dl>
  );
}

function PlanDraftStageItem({ index, stage }: { index: number; stage: PlanDraftStage }) {
  const dateLabel = [stage.startDate, stage.endDate].filter(Boolean).join(" - ");

  return (
    <li className="sunny-plan-draft-stage">
      <div className="sunny-plan-draft-stage-head">
        <span aria-hidden="true">{index + 1}</span>
        <div>
          <h4>{stage.title}</h4>
          {dateLabel ? <p>{dateLabel}</p> : null}
        </div>
      </div>
      {stage.description ? <p className="sunny-plan-draft-stage-description">{stage.description}</p> : null}
      <ul className="sunny-plan-draft-task-list">
        {stage.tasks.map((task) => (
          <li key={task}>{task}</li>
        ))}
      </ul>
    </li>
  );
}

function PlanDraftStageList({ stages }: { stages: PlanDraftStage[] }) {
  return (
    <section className="sunny-plan-draft-section" aria-label="计划草案阶段">
      <h4>阶段拆解</h4>
      <ol className="sunny-plan-draft-stage-list">
        {stages.map((stage, index) => (
          <PlanDraftStageItem key={`${stage.title}-${index}`} index={index} stage={stage} />
        ))}
      </ol>
    </section>
  );
}

function PlanDraftMutedList({
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
    <AppPanel className="sunny-plan-draft-muted-panel" variant="quiet" aria-label={ariaLabel}>
      <h4>{title}</h4>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </AppPanel>
  );
}

function PlanDraftAssumptions({ draft }: { draft: PlanDraft }) {
  return (
    <PlanDraftMutedList
      ariaLabel="计划草案假设"
      items={draft.assumptions}
      title="基于以下假设"
    />
  );
}

function PlanDraftRisks({ draft }: { draft: PlanDraft }) {
  return (
    <PlanDraftMutedList
      ariaLabel="计划草案风险"
      items={draft.risks}
      title="风险"
    />
  );
}

function PlanDraftActions({
  onGenerateChecklist,
  onPrepareCreate,
  onRevise,
}: Pick<PlanDraftCardProps, "onGenerateChecklist" | "onPrepareCreate" | "onRevise">) {
  return (
    <div className="sunny-plan-draft-actions" role="toolbar" aria-label="计划草案操作">
      <AppButton disabled={!onRevise} onClick={onRevise} size="sm" type="button" variant="outline">
        继续修改
      </AppButton>
      <AppButton
        disabled={!onGenerateChecklist}
        onClick={onGenerateChecklist}
        size="sm"
        type="button"
        variant="outline"
      >
        拆成清单
      </AppButton>
      <AppButton
        disabled={!onPrepareCreate}
        onClick={onPrepareCreate}
        size="sm"
        type="button"
        variant="secondary"
      >
        准备创建计划
      </AppButton>
    </div>
  );
}

export function PlanDraftCard({
  className,
  draft,
  onGenerateChecklist,
  onPrepareCreate,
  onRevise,
}: PlanDraftCardProps) {
  return (
    <AppCard
      className={cn("sunny-plan-draft-card", className)}
      padding="none"
      role="group"
      variant="quiet"
      aria-label="计划草案"
    >
      <PlanDraftHeader draft={draft} />
      <PlanDraftMeta draft={draft} />
      <PlanDraftStageList stages={draft.stages} />
      <div className="sunny-plan-draft-context-grid">
        <PlanDraftAssumptions draft={draft} />
        <PlanDraftRisks draft={draft} />
      </div>
      <PlanDraftActions
        onGenerateChecklist={onGenerateChecklist}
        onPrepareCreate={onPrepareCreate}
        onRevise={onRevise}
      />
    </AppCard>
  );
}
