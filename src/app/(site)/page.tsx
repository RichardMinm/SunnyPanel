import Link from "next/link";

import { PostPreviewCard } from "@/components/public/PostPreviewCard";
import { PublicSiteFrame } from "@/components/public/PublicSiteFrame";
import { formatDate } from "@/lib/formatters";
import {
  getPublicNotes,
  getPublicPages,
  getPublicPostsWithOptions,
  getPublicTimelineEvents,
  getPublicUpdates,
} from "@/lib/payload/public";

const publicSurfaces = [
  { href: "/about", label: "About", description: "适合放个人介绍、方法论与站点说明。", status: "Ready" },
  { href: "/now", label: "Now", description: "适合记录当前正在做的事与近期状态。", status: "Ready" },
  { href: "/blog", label: "Blog", description: "长文章、项目复盘与成体系的写作。", status: "Live" },
  { href: "/notes", label: "Notes", description: "适合碎片灵感、短想法和过程片段。", status: "Rolling" },
  { href: "/updates", label: "Updates", description: "记录生活、工作和项目推进的动态流。", status: "Rolling" },
  { href: "/timeline", label: "Timeline", description: "把阶段节点组织成长期可回看的叙事骨架。", status: "Core" },
];

const privateSurfaces = [
  { href: "/admin", label: "Payload Admin", description: "管理内容、媒体与发布状态。", tone: "内容后台" },
  { href: "/dashboard", label: "Dashboard", description: "查看计划流转、草稿积压和最近活动。", tone: "私有工作台" },
];

export default async function Home() {
  const [posts, notes, updates, timeline, pages] = await Promise.all([
    getPublicPostsWithOptions({ limit: 3 }),
    getPublicNotes({ limit: 4 }),
    getPublicUpdates({ limit: 4 }),
    getPublicTimelineEvents({ featuredOnly: true, limit: 3 }),
    getPublicPages({ limit: 6 }),
  ]);

  const pinnedNotes = notes.docs.filter((note) => note.pinned).length;

  return (
    <PublicSiteFrame>
      <main className="flex flex-1 flex-col gap-8 pb-4">
        <section className="sunny-fade-up grid gap-6 xl:grid-cols-[1.25fr_0.85fr]">
          <div className="sunny-card sunny-card-strong rounded-[2.4rem] px-8 py-9 md:px-10 md:py-11">
            <div className="flex flex-wrap gap-3">
              <span className="sunny-chip">单用户内容系统</span>
              <span className="sunny-chip">公开表达 + 私有运营</span>
              <span className="sunny-chip">Next.js + Payload</span>
            </div>

            <div className="mt-10 max-w-4xl">
              <p className="sunny-kicker text-xs text-accent-strong">Personal panel system</p>
              <h1 className="sunny-display mt-4 text-5xl leading-[0.95] text-foreground md:text-7xl">
                让写作、记录、计划和回看，最终落在同一个长期使用的面板里。
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-muted md:text-lg">
                SunnyPanel 不是单纯的博客，也不是泛后台模板。它更像一套属于个人的表达基础设施：
                前台负责呈现内容，后台负责把计划、媒体和节奏慢慢沉淀成长期资产。
              </p>
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link className="sunny-button-primary" href="/blog">
                浏览公开内容
              </Link>
              <Link className="sunny-button-secondary" href="/dashboard">
                打开私有工作台
              </Link>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <div className="rounded-[1.6rem] border border-border bg-white/55 p-5">
                <p className="sunny-kicker text-[0.7rem] text-muted">Public records</p>
                <p className="mt-3 text-3xl font-semibold text-foreground">
                  {posts.totalDocs + notes.totalDocs + updates.totalDocs + timeline.totalDocs + pages.totalDocs}
                </p>
                <p className="mt-2 text-sm leading-7 text-muted">
                  公开层已接入首页、列表页、时间线叙事和固定页面。
                </p>
              </div>
              <div className="rounded-[1.6rem] border border-border bg-white/55 p-5">
                <p className="sunny-kicker text-[0.7rem] text-muted">Featured timeline</p>
                <p className="mt-3 text-3xl font-semibold text-foreground">{timeline.totalDocs}</p>
                <p className="mt-2 text-sm leading-7 text-muted">重要节点会先进入时间线，成为整个站点的回看主轴。</p>
              </div>
              <div className="rounded-[1.6rem] border border-border bg-white/55 p-5">
                <p className="sunny-kicker text-[0.7rem] text-muted">Quick capture</p>
                <p className="mt-3 text-3xl font-semibold text-foreground">{pinnedNotes}</p>
                <p className="mt-2 text-sm leading-7 text-muted">已置顶的短内容会优先成为日常观察和思考的入口。</p>
              </div>
            </div>
          </div>

          <aside className="grid gap-6">
            <div className="sunny-card rounded-[2.2rem] p-8">
              <div className="flex items-center gap-3">
                <span className="sunny-badge sunny-badge-accent">Now building</span>
                <span className="text-sm text-muted">V1 正在成形</span>
              </div>

              <div className="mt-6 space-y-5 text-sm leading-7 text-muted">
                <div className="rounded-[1.5rem] border border-border bg-white/55 p-5">
                  <h2 className="text-lg font-semibold text-foreground">表达层</h2>
                  <p className="mt-2">
                    Blog、Notes、Updates、Timeline 都已经能从 Payload 读取公开内容。
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-border bg-white/55 p-5">
                  <h2 className="text-lg font-semibold text-foreground">运营层</h2>
                  <p className="mt-2">
                    Dashboard 已接入登录态、计划状态、草稿积压和最近编辑内容。
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-border bg-white/55 p-5">
                  <h2 className="text-lg font-semibold text-foreground">原则</h2>
                  <p className="mt-2">
                    先让系统对你自己好用，再慢慢扩展成真正适合长期运营的个人面板。
                  </p>
                </div>
              </div>
            </div>

            <div className="sunny-panel rounded-[2.2rem] p-7">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-lg font-semibold text-accent-strong">
                  2
                </div>
                <div>
                  <p className="sunny-kicker text-[0.7rem] text-muted">Double surface</p>
                  <p className="text-lg font-semibold text-foreground">公开表达 + 私有运营同时存在</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-7 text-muted">
                这也是 SunnyPanel 区别于普通博客模板的地方。公开侧负责被阅读，私有侧负责持续使用。
              </p>
            </div>
          </aside>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="sunny-card rounded-[2.2rem] p-8">
            <div className="flex items-center gap-4">
              <div>
                <p className="sunny-kicker text-xs text-muted">Public surfaces</p>
                <h2 className="sunny-display mt-2 text-3xl text-foreground">公开表达层</h2>
              </div>
              <div className="sunny-section-line hidden md:block" />
            </div>

            <div className="mt-6 grid gap-4">
              {publicSurfaces.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group rounded-[1.6rem] border border-border bg-white/60 p-5 transition hover:-translate-y-1 hover:bg-white/85"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-foreground">{item.label}</h3>
                      <p className="mt-2 text-sm leading-7 text-muted">{item.description}</p>
                    </div>
                    <span className="sunny-badge sunny-badge-muted">{item.status}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="sunny-card rounded-[2.2rem] p-8">
            <div className="flex items-center gap-4">
              <div>
                <p className="sunny-kicker text-xs text-muted">Private surfaces</p>
                <h2 className="sunny-display mt-2 text-3xl text-foreground">私有运营层</h2>
              </div>
              <div className="sunny-section-line hidden md:block" />
            </div>

            <div className="mt-6 grid gap-4">
              {privateSurfaces.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group rounded-[1.6rem] border border-border bg-white/65 p-5 transition hover:-translate-y-1 hover:bg-white"
                >
                  <span className="sunny-badge sunny-badge-accent">{item.tone}</span>
                  <h3 className="mt-4 text-xl font-semibold text-foreground">{item.label}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted">{item.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="sunny-card rounded-[2.2rem] p-8">
            <div className="flex items-center gap-4">
              <div>
                <p className="sunny-kicker text-xs text-muted">Featured writing</p>
                <h2 className="sunny-display mt-2 text-3xl text-foreground">最近长文</h2>
              </div>
              <div className="sunny-section-line hidden md:block" />
            </div>

            <div className="mt-6 grid gap-4">
              {posts.docs.length > 0 ? (
                posts.docs.map((post, index) => (
                  <PostPreviewCard
                    key={post.id}
                    post={post}
                    variant={index === 0 ? "featured" : "compact"}
                  />
                ))
              ) : (
                <div className="rounded-[1.7rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted">
                  发布第一篇公开 Post 之后，这里会成为首页最主要的阅读入口。
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6">
            <div className="sunny-card rounded-[2.2rem] p-8">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sunny-kicker text-xs text-muted">Timeline spine</p>
                  <h2 className="sunny-display mt-2 text-3xl text-foreground">精选节点</h2>
                </div>
                <span className="sunny-badge sunny-badge-muted">{timeline.totalDocs} 条公开</span>
              </div>

              <div className="mt-6 space-y-4">
                {timeline.docs.length > 0 ? (
                  timeline.docs.map((event) => (
                    <div key={event.id} className="rounded-[1.45rem] border border-border bg-white/60 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-foreground">{event.title}</h3>
                          <p className="mt-2 text-sm text-muted">{formatDate(event.eventDate)}</p>
                        </div>
                        <span className="sunny-badge sunny-badge-accent">{event.type}</span>
                      </div>
                      {event.description ? (
                        <p className="mt-3 text-sm leading-7 text-muted">{event.description}</p>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.45rem] border border-dashed border-border bg-white/45 p-5 text-sm leading-7 text-muted">
                    给 `TimelineEvent` 打开公开和精选后，这里会成为首页的回顾入口。
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="sunny-card rounded-[2.2rem] p-8">
            <div className="flex items-center gap-4">
              <div>
                <p className="sunny-kicker text-xs text-muted">Quick notes</p>
                <h2 className="sunny-display mt-2 text-3xl text-foreground">短内容流</h2>
              </div>
              <div className="sunny-section-line hidden md:block" />
            </div>

            <div className="mt-6 space-y-4">
              {notes.docs.length > 0 ? (
                notes.docs.map((note) => (
                  <div key={note.id} className="rounded-[1.45rem] border border-border bg-white/58 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="sunny-badge sunny-badge-muted">{note.category}</span>
                      {note.mood ? <span className="sunny-badge sunny-badge-accent">{note.mood}</span> : null}
                      <span className="text-sm text-muted">{formatDate(note.createdAt)}</span>
                    </div>
                    <p className="mt-4 text-sm leading-8 text-foreground">{note.content}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[1.45rem] border border-dashed border-border bg-white/45 p-5 text-sm leading-7 text-muted">
                  Notes 已经接好，适合先往里放碎片想法和临时观察。
                </div>
              )}
            </div>
          </div>

          <div className="sunny-card rounded-[2.2rem] p-8">
            <div className="flex items-center gap-4">
              <div>
                <p className="sunny-kicker text-xs text-muted">Rolling updates</p>
                <h2 className="sunny-display mt-2 text-3xl text-foreground">动态节奏</h2>
              </div>
              <div className="sunny-section-line hidden md:block" />
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {updates.docs.length > 0 ? (
                updates.docs.map((update) => (
                  <div key={update.id} className="rounded-[1.45rem] border border-border bg-white/58 p-5">
                    <div className="flex items-center justify-between gap-3">
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
                  </div>
                ))
              ) : (
                <div className="rounded-[1.45rem] border border-dashed border-border bg-white/45 p-6 text-sm leading-7 text-muted md:col-span-2">
                  Updates 会比 Blog 更轻，也更适合持续积累生活、工作和项目变化。
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </PublicSiteFrame>
  );
}
