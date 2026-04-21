import Link from "next/link";
import type { Checklist } from "@/payload-types";

import { CollectionEmptyState } from "@/components/public/CollectionEmptyState";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { SectionIntro } from "@/components/public/SectionIntro";
import { formatDateTime } from "@/lib/formatters";
import { getPublicChecklists } from "@/lib/payload/public";

type ChecklistGroup = NonNullable<Checklist["groups"]>[number];

const getCompletedCount = (groups: null | ChecklistGroup[] = []) =>
  (groups ?? []).reduce(
    (total, group) => total + (group.items ?? []).filter((item) => item?.isCompleted).length,
    0,
  );

const getItemCount = (groups: null | ChecklistGroup[] = []) =>
  (groups ?? []).reduce((total, group) => total + (group.items?.length ?? 0), 0);

export default async function ChecklistsPage() {
  const checklists = await getPublicChecklists({ limit: 24 });
  const totalGroups = checklists.docs.reduce((total, checklist) => total + (checklist.groups?.length ?? 0), 0);
  const totalItems = checklists.docs.reduce(
    (total, checklist) => total + getItemCount(checklist.groups ?? []),
    0,
  );
  const totalCompleted = checklists.docs.reduce(
    (total, checklist) => total + getCompletedCount(checklist.groups ?? []),
    0,
  );

  return (
    <PublicSiteFrame>
      <main className="flex flex-1 flex-col gap-5 pb-6 md:gap-7">
        <SectionIntro
          eyebrow="Checklists"
          title="Checklist"
          stats={[
            { label: "清单", value: checklists.docs.length },
            { label: "分组", value: totalGroups },
            { label: "已完成", value: `${totalCompleted}/${totalItems}` },
          ]}
          actions={
            <Link href="/admin/collections/checklists" className="sunny-button-secondary">
              管理清单
            </Link>
          }
        />

        {checklists.docs.length > 0 ? (
          <section className="grid gap-5">
            {checklists.docs.map((checklist) => {
              const groups = checklist.groups ?? [];
              const totalItems = getItemCount(groups);
              const completedItems = getCompletedCount(groups);

              return (
                <article key={checklist.id} className="sunny-card rounded-[1.5rem] px-4 py-5 sm:px-5 md:rounded-[1.8rem] md:px-7 md:py-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap gap-2">
                        <span className="sunny-badge sunny-badge-accent">Checklist</span>
                        <span className="sunny-badge sunny-badge-muted">
                          {completedItems}/{totalItems || 0} 完成
                        </span>
                      </div>
                      <h2 className="sunny-display mt-4 text-[2rem] text-foreground md:text-3xl">{checklist.title}</h2>
                      {checklist.summary ? (
                        <p className="mt-3 text-sm leading-7 text-muted">{checklist.summary}</p>
                      ) : null}
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-[1.15rem] border border-border bg-white/55 px-4 py-4 text-center text-sm text-muted md:min-w-[10rem] md:grid-cols-1 md:gap-0 md:rounded-[1.35rem] md:text-left">
                      <p>分组 {groups.length}</p>
                      <p className="md:mt-2">条目 {totalItems}</p>
                      <p className="md:mt-2">已完成 {completedItems}</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3 md:mt-6 md:space-y-4">
                    {groups.map((group, groupIndex) => {
                      const items = group.items ?? [];
                      const completedInGroup = items.filter((item) => item.isCompleted).length;

                      return (
                        <details
                          key={group.id ?? `${checklist.id}-${groupIndex}`}
                          className="rounded-[1.15rem] border border-border bg-white/58 px-4 py-4 md:rounded-[1.4rem] md:px-5"
                          open={groupIndex === 0}
                        >
                          <summary className="flex cursor-pointer list-none flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <div className="min-w-0">
                              <p className="text-base font-semibold text-foreground md:text-lg">{group.title}</p>
                              <p className="mt-1 text-sm text-muted">
                                {completedInGroup}/{items.length} 已完成
                              </p>
                            </div>
                            <span className="sunny-badge sunny-badge-muted self-start sm:self-auto">展开条目</span>
                          </summary>

                          <div className="mt-4 space-y-3">
                            {items.map((item, itemIndex) => (
                              <div
                                key={item.id ?? `${group.id ?? groupIndex}-${itemIndex}`}
                                className="rounded-[1rem] border border-border/80 bg-background/55 px-4 py-4 md:rounded-[1.15rem]"
                              >
                                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span
                                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[0.7rem] ${
                                          item.isCompleted
                                            ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                                            : "border-border bg-white/70 text-muted"
                                        }`}
                                      >
                                        {item.isCompleted ? "✓" : ""}
                                      </span>
                                      <p className="text-[0.97rem] font-medium text-foreground md:text-base">{item.title}</p>
                                    </div>
                                    {item.description ? (
                                      <p className="mt-2 pl-7 text-sm leading-7 text-muted md:pr-4">{item.description}</p>
                                    ) : null}
                                  </div>

                                  <div className="flex flex-wrap gap-2 pl-7 md:max-w-[45%] md:justify-end md:pl-0">
                                    <span
                                      className={`sunny-badge ${
                                        item.isCompleted ? "sunny-badge-accent" : "sunny-badge-muted"
                                      }`}
                                    >
                                      {item.isCompleted ? "已完成" : "未完成"}
                                    </span>
                                    {item.completedAt ? (
                                      <span className="sunny-badge sunny-badge-muted">
                                        {formatDateTime(item.completedAt)}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>

                                {item.completionNote ? (
                                  <div className="mt-3 rounded-[1rem] bg-white/72 px-4 py-3">
                                    <p className="sunny-kicker text-[0.65rem] text-muted">Completion note</p>
                                    <p className="mt-2 text-sm leading-7 text-muted">{item.completionNote}</p>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <CollectionEmptyState
            title="还没有公开清单"
            body="先在后台新建一个 Checklist，再加入分组和条目，这里就会自动展示。"
          />
        )}
      </main>
    </PublicSiteFrame>
  );
}
