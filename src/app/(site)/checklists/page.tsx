import type { Checklist } from "@/payload-types";

import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
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

  return (
    <PublicSiteFrame>
      <main className="flex flex-1 flex-col gap-7 pb-6">
        <section className="sunny-card sunny-card-strong rounded-[2rem] px-7 py-8 md:px-9 md:py-9">
          <div className="flex flex-wrap gap-3">
            <span className="sunny-chip">折叠清单</span>
            <span className="sunny-chip">后台可自定义</span>
            <span className="sunny-chip">完成自动进入 Timeline</span>
          </div>

          <div className="mt-8 max-w-4xl">
            <p className="sunny-kicker text-[0.7rem] text-accent-strong">Structured learning lists</p>
            <h1 className="sunny-display mt-4 text-4xl leading-none text-foreground md:text-6xl">
              把长期任务拆成可折叠、可勾选、可回看的清单。
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-muted md:text-base md:leading-8">
              你可以在后台维护课程、章节、主题和条目。每个条目都支持手动标记完成、记录时间和备注，
              并在完成时自动沉淀到 Timeline，形成一条持续可回顾的进度线。
            </p>
          </div>
        </section>

        {checklists.docs.length > 0 ? (
          <section className="grid gap-5">
            {checklists.docs.map((checklist) => {
              const groups = checklist.groups ?? [];
              const totalItems = getItemCount(groups);
              const completedItems = getCompletedCount(groups);

              return (
                <article key={checklist.id} className="sunny-card rounded-[1.8rem] px-6 py-6 md:px-7">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="max-w-3xl">
                      <div className="flex flex-wrap gap-2">
                        <span className="sunny-badge sunny-badge-accent">Checklist</span>
                        <span className="sunny-badge sunny-badge-muted">
                          {completedItems}/{totalItems || 0} 完成
                        </span>
                      </div>
                      <h2 className="sunny-display mt-4 text-3xl text-foreground">{checklist.title}</h2>
                      {checklist.summary ? (
                        <p className="mt-3 text-sm leading-7 text-muted">{checklist.summary}</p>
                      ) : null}
                    </div>

                    <div className="min-w-[10rem] rounded-[1.35rem] border border-border bg-white/55 px-4 py-4 text-sm text-muted">
                      <p>分组 {groups.length}</p>
                      <p className="mt-2">条目 {totalItems}</p>
                      <p className="mt-2">已完成 {completedItems}</p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    {groups.map((group, groupIndex) => {
                      const items = group.items ?? [];
                      const completedInGroup = items.filter((item) => item.isCompleted).length;

                      return (
                        <details
                          key={group.id ?? `${checklist.id}-${groupIndex}`}
                          className="rounded-[1.4rem] border border-border bg-white/58 px-5 py-4"
                          open={groupIndex === 0}
                        >
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
                            <div>
                              <p className="text-lg font-semibold text-foreground">{group.title}</p>
                              <p className="mt-1 text-sm text-muted">
                                {completedInGroup}/{items.length} 已完成
                              </p>
                            </div>
                            <span className="sunny-badge sunny-badge-muted">展开条目</span>
                          </summary>

                          <div className="mt-4 space-y-3">
                            {items.map((item, itemIndex) => (
                              <div
                                key={item.id ?? `${group.id ?? groupIndex}-${itemIndex}`}
                                className="rounded-[1.15rem] border border-border/80 bg-background/55 px-4 py-4"
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
                                      <p className="text-base font-medium text-foreground">{item.title}</p>
                                    </div>
                                    {item.description ? (
                                      <p className="mt-2 pl-7 text-sm leading-7 text-muted">{item.description}</p>
                                    ) : null}
                                  </div>

                                  <div className="flex flex-wrap gap-2 pl-7 md:pl-0">
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
          <section className="sunny-card rounded-[1.8rem] px-6 py-7 text-sm leading-7 text-muted">
            还没有公开的清单。你可以先在后台新建一个 `Checklist`，例如“高等数学”，再在其中加入
            “映射与函数”这类可勾选条目。
          </section>
        )}
      </main>
    </PublicSiteFrame>
  );
}
