import Link from "next/link";

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
        <section className="sunny-fade-up sunny-card sunny-card-strong rounded-[1.6rem] px-5 py-6 sm:px-6 sm:py-7 md:rounded-[2rem] md:px-9 md:py-9">
          <div className="flex flex-wrap gap-3">
            <span className="sunny-chip">Checklist first</span>
            <span className="sunny-chip">Updates rolling</span>
            <span className="sunny-chip">更轻的首页</span>
          </div>

          <div className="mt-6 max-w-4xl md:mt-8">
            <p className="sunny-kicker text-[0.72rem] text-accent-strong">Focused home</p>
            <h1 className="sunny-display mt-4 text-[2.2rem] leading-[0.95] text-foreground sm:text-5xl md:text-6xl">
              首页只保留正在推进的清单，和最近发生的更新。
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-muted md:text-base md:leading-8">
              这样首页会更像一个真正的起点，而不是系统说明页。清单负责长期任务结构，
              Updates 负责最近的变化与推进节奏。
            </p>
          </div>

          <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
            <Link className="sunny-button-primary w-full sm:w-auto" href="/checklists">
              打开 Checklist
            </Link>
            <Link className="sunny-button-secondary w-full sm:w-auto" href="/updates">
              查看 Updates
            </Link>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-2 md:mt-8 md:gap-4">
            <div className="rounded-[1.2rem] border border-border bg-white/58 px-4 py-4 md:rounded-[1.4rem] md:px-5 md:py-5">
              <p className="sunny-kicker text-[0.68rem] text-muted">Checklists</p>
              <p className="mt-3 text-[1.9rem] font-semibold text-foreground md:text-3xl">{checklists.totalDocs}</p>
              <p className="mt-2 text-sm leading-7 text-muted">分组任务、课程章节和可回看的完成记录。</p>
            </div>
            <div className="rounded-[1.2rem] border border-border bg-white/58 px-4 py-4 md:rounded-[1.4rem] md:px-5 md:py-5">
              <p className="sunny-kicker text-[0.68rem] text-muted">Updates</p>
              <p className="mt-3 text-[1.9rem] font-semibold text-foreground md:text-3xl">{updates.totalDocs}</p>
              <p className="mt-2 text-sm leading-7 text-muted">最近的生活、工作或项目推进会先出现在这里。</p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr] xl:gap-6">
          <div className="sunny-card rounded-[1.55rem] p-5 sm:p-6 md:rounded-[1.9rem] md:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="sunny-kicker text-xs text-muted">Checklist</p>
                <h2 className="sunny-display mt-2 text-[2rem] text-foreground md:text-3xl">当前清单</h2>
              </div>
              <Link className="sunny-button-secondary w-full sm:w-auto" href="/checklists">
                全部查看
              </Link>
            </div>

            <div className="mt-5 grid gap-3 md:mt-6 md:gap-4">
              {checklists.docs.length > 0 ? (
                checklists.docs.map((checklist) => {
                  const groups = checklist.groups ?? [];
                  const itemCount = getChecklistItemCount(groups);
                  const completedCount = getChecklistCompletedCount(groups);

                  return (
                    <Link
                      key={checklist.id}
                      href="/checklists"
                      className="rounded-[1.15rem] border border-border bg-white/60 px-4 py-4 transition hover:-translate-y-0.5 hover:bg-white/80 md:rounded-[1.35rem] md:px-5 md:py-5"
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
                    </Link>
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
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="sunny-kicker text-xs text-muted">Updates</p>
                <h2 className="sunny-display mt-2 text-[2rem] text-foreground md:text-3xl">最近更新</h2>
              </div>
              <Link className="sunny-button-secondary w-full sm:w-auto" href="/updates">
                全部查看
              </Link>
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
