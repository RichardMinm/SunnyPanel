import type { Checklist } from "@/payload-types";

import { MotionReveal } from "@/components/public/MotionReveal";
import {
  getChecklistCompletedCount,
  getChecklistItemCount,
  type ChecklistGroup,
} from "@/lib/checklists";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";

type ChecklistPreviewCardProps = {
  checklist: Checklist;
  locale: SiteLocale;
};

export function ChecklistPreviewCard({ checklist, locale }: ChecklistPreviewCardProps) {
  const copy = getSiteCopy(locale);
  const groups = checklist.groups ?? [];
  const itemCount = getChecklistItemCount(groups);
  const completedCount = getChecklistCompletedCount(groups);
  const previewGroups = groups.slice(0, 2);

  return (
    <MotionReveal>
      <article className="rounded-[1.15rem] border border-border bg-white/60 px-4 py-4 transition hover:-translate-y-1 hover:bg-white/72 md:rounded-[1.35rem] md:px-5 md:py-5">
        <div className="flex flex-wrap gap-2">
          <span className="sunny-badge sunny-badge-accent">{copy.checklists.badgeChecklist}</span>
          <span className="sunny-badge sunny-badge-muted">
            {completedCount}/{itemCount || 0} {copy.home.checklistCompleted}
          </span>
        </div>

        <h3 className="mt-4 text-lg font-semibold text-foreground md:text-xl">{checklist.title}</h3>
        {checklist.summary ? (
          <p className="mt-2 text-sm leading-7 text-muted">{checklist.summary}</p>
        ) : null}
        <p className="mt-3 text-sm text-muted">
          {copy.home.checklistGroups} {groups.length} · {copy.home.checklistItems} {itemCount}
        </p>

        <div className="mt-4 space-y-3">
          {previewGroups.map((group, groupIndex) => (
            <ChecklistPreviewGroup key={group.id ?? `${checklist.id}-${groupIndex}`} group={group} />
          ))}
        </div>
      </article>
    </MotionReveal>
  );
}

function ChecklistPreviewGroup({ group }: { group: ChecklistGroup }) {
  return (
    <div className="rounded-[1rem] border border-border/80 bg-background/55 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground md:text-base">{group.title}</p>
        <span className="text-xs text-muted">
          {(group.items ?? []).filter((item) => item?.isCompleted).length}/{group.items?.length ?? 0}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {(group.items ?? []).slice(0, 3).map((item, itemIndex) => (
          <div
            key={item.id ?? `${group.id ?? "group"}-${itemIndex}`}
            className="flex items-start gap-3 rounded-[0.85rem] bg-white/70 px-3 py-2.5"
          >
            <span
              className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.7rem] ${
                item?.isCompleted
                  ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                  : "border-border bg-white text-muted"
              }`}
            >
              {item?.isCompleted ? "✓" : ""}
            </span>
            <div className="min-w-0">
              <p className="text-sm text-foreground">{item?.title}</p>
              {item?.completionNote ? (
                <p className="mt-1 text-xs leading-6 text-muted">{item.completionNote}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
