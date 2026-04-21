import type { Checklist } from "@/payload-types";

import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { formatDate } from "@/lib/formatters";
import { getPublicChecklists, getPublicUpdates } from "@/lib/payload/public";

type ChecklistGroup = NonNullable<Checklist["groups"]>[number];

const getChecklistItemCount = (groups: null | ChecklistGroup[] = []) =>
  (groups ?? []).reduce((total, group) => total + (group.items?.length ?? 0), 0);

const getChecklistCompletedCount = (groups: null | ChecklistGroup[] = []) =>
  (groups ?? []).reduce(
    (total, group) => total + (group.items ?? []).filter((item) => item?.isCompleted).length,
    0,
  );

export default async function Home() {
  const [checklists, updates] = await Promise.all([
    getPublicChecklists({ limit: 4 }),
    getPublicUpdates({ limit: 4 }),
  ]);

  return (
    <PublicSiteFrame>
      <main className="flex flex-1 flex-col gap-5 pb-5 md:gap-6">
        <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr] xl:gap-6">
          <div className="sunny-card rounded-[1.55rem] p-5 sm:p-6 md:rounded-[1.9rem] md:p-7">
            <div>
              <div>
                <p className="sunny-kicker text-xs text-muted">Checklist</p>
                <h2 className="sunny-display mt-2 text-[2rem] text-foreground md:text-3xl">当前清单</h2>
                <p className="mt-3 text-sm leading-7 text-muted">
                  直接在首页展开最近的清单内容，不再额外放一层跳转按钮。
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:mt-6 md:gap-4">
              {checklists.docs.length > 0 ? (
                checklists.docs.map((checklist) => {
                  const groups = checklist.groups ?? [];
                  const itemCount = getChecklistItemCount(groups);
                  const completedCount = getChecklistCompletedCount(groups);
                  const previewGroups = groups.slice(0, 2);

                  return (
                    <article
                      key={checklist.id}
                      className="rounded-[1.15rem] border border-border bg-white/60 px-4 py-4 md:rounded-[1.35rem] md:px-5 md:py-5"
                    >
                      <div className="flex flex-wrap gap-2">
                        <span className="sunny-badge sunny-badge-accent">Checklist</span>
                        <span className="sunny-badge sunny-badge-muted">
                          {completedCount}/{itemCount || 0} 完成
                        </span>
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-foreground md:text-xl">{checklist.title}</h3>
                      {checklist.summary ? (
                        <p className="mt-2 text-sm leading-7 text-muted">{checklist.summary}</p>
                      ) : null}
                      <p className="mt-3 text-sm text-muted">分组 {groups.length} · 条目 {itemCount}</p>

                      <div className="mt-4 space-y-3">
                        {previewGroups.map((group, groupIndex) => (
                          <div
                            key={group.id ?? `${checklist.id}-${groupIndex}`}
                            className="rounded-[1rem] border border-border/80 bg-background/55 px-4 py-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-foreground md:text-base">{group.title}</p>
                              <span className="text-xs text-muted">
                                {(group.items ?? []).filter((item) => item?.isCompleted).length}/
                                {group.items?.length ?? 0}
                              </span>
                            </div>

                            <div className="mt-3 space-y-2">
                              {(group.items ?? []).slice(0, 3).map((item, itemIndex) => (
                                <div
                                  key={item.id ?? `${group.id ?? groupIndex}-${itemIndex}`}
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
                        ))}
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-[1.35rem] border border-dashed border-border bg-white/45 px-5 py-5 text-sm leading-7 text-muted">
                  还没有公开的 Checklist。你可以先在后台建一个课程型清单，比如“高等数学”。
                </div>
              )}
            </div>
          </div>

          <div className="sunny-card rounded-[1.55rem] p-5 sm:p-6 md:rounded-[1.9rem] md:p-7">
            <div>
              <div>
                <p className="sunny-kicker text-xs text-muted">Updates</p>
                <h2 className="sunny-display mt-2 text-[2rem] text-foreground md:text-3xl">最近更新</h2>
                <p className="mt-3 text-sm leading-7 text-muted">
                  Update 直接在首页展示正文片段，减少来回跳转。
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3 md:mt-6 md:space-y-4">
              {updates.docs.length > 0 ? (
                updates.docs.map((update) => (
                  <article
                    key={update.id}
                    className="rounded-[1.15rem] border border-border bg-white/60 px-4 py-4 md:rounded-[1.35rem] md:px-5 md:py-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="sunny-badge sunny-badge-accent">{update.type}</span>
                      <span className="text-sm text-muted">{formatDate(update.createdAt)}</span>
                    </div>
                    <p className="mt-4 text-sm leading-8 text-foreground">{update.content}</p>
                    {update.link ? (
                      <a
                        className="mt-4 inline-flex text-sm font-semibold text-accent-strong"
                        href={update.link}
                        rel="noreferrer"
                        target="_blank"
                      >
                        查看关联资源
                      </a>
                    ) : null}
                  </article>
                ))
              ) : (
                <div className="rounded-[1.35rem] border border-dashed border-border bg-white/45 px-5 py-5 text-sm leading-7 text-muted">
                  还没有公开的 Update。发布后，这里会成为首页最轻量的动态入口。
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </PublicSiteFrame>
  );
}
