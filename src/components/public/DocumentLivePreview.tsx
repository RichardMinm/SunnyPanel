"use client";

import Link from "next/link";

import { useLivePreview } from "@payloadcms/live-preview-react";

import { ChecklistPreviewCard } from "@/components/public/ChecklistPreviewCard";
import { RecordCoverImage } from "@/components/public/RecordCoverImage";
import { RichTextContent } from "@/components/public/RichTextContent";
import { formatDate, formatDateTime } from "@/lib/formatters";
import { getSiteCopy, type SiteLocale } from "@/lib/site-copy";
import type {
  Checklist,
  Note,
  Page,
  Post,
  TimelineEvent,
  Update,
} from "@/payload-types";
import type { PreviewCollectionSlug } from "@/lib/payload/preview";

type PreviewDocument = Checklist | Note | Page | Post | TimelineEvent | Update;

type DocumentLivePreviewProps = {
  collection: PreviewCollectionSlug;
  id: string;
  initialData: PreviewDocument;
  locale: SiteLocale;
};

const serverURL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";

export function DocumentLivePreview({
  collection,
  id,
  initialData,
  locale,
}: DocumentLivePreviewProps) {
  const { data } = useLivePreview<PreviewDocument>({
    initialData,
    depth: 2,
    serverURL,
  });

  const copy = getSiteCopy(locale);
  const document = data ?? initialData;

  const topBadges = (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
      <span className="sunny-badge sunny-badge-accent">{getCollectionLabel(collection, locale)}</span>
      {"status" in document && document.status ? (
        <span className="sunny-badge sunny-badge-muted">{document.status}</span>
      ) : null}
      {"visibility" in document && document.visibility ? (
        <span className="sunny-badge sunny-badge-muted">{document.visibility}</span>
      ) : null}
      {"updatedAt" in document && document.updatedAt ? (
        <span className="text-sm text-muted">
          {copy.common.updatedAt}：{formatDateTime(document.updatedAt, locale)}
        </span>
      ) : null}
    </div>
  );

  return (
    <main className="flex flex-1 flex-col gap-6 pb-4">
      <section className="sunny-panel rounded-[1.65rem] px-5 py-5 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="sunny-kicker text-[0.68rem] text-muted">
              {locale === "en" ? "Live preview" : "实时预览"}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground md:text-[2rem]">
              {getPreviewTitle(document, collection, id)}
            </h1>
          </div>

          <div className="flex flex-wrap gap-2">
            {collection === "posts" && "slug" in document ? (
              <Link href={`/blog/${document.slug}`} className="sunny-button-secondary px-4 py-2 text-sm">
                {locale === "en" ? "Open public page" : "打开公开页面"}
              </Link>
            ) : null}
            {collection === "pages" && "slug" in document ? (
              <Link href={`/${document.slug}`} className="sunny-button-secondary px-4 py-2 text-sm">
                {locale === "en" ? "Open public page" : "打开公开页面"}
              </Link>
            ) : null}
          </div>
        </div>

        <div className="mt-4">{topBadges}</div>
      </section>

      {renderPreviewDocument({
        collection,
        document,
        id,
        locale,
      })}
    </main>
  );
}

const getCollectionLabel = (collection: PreviewCollectionSlug, locale: SiteLocale) => {
  const labels: Record<PreviewCollectionSlug, { en: string; zh: string }> = {
    checklists: { en: "Checklist", zh: "清单" },
    notes: { en: "Note", zh: "短札" },
    pages: { en: "Page", zh: "页面" },
    posts: { en: "Post", zh: "文章" },
    "timeline-events": { en: "Timeline", zh: "时间线" },
    updates: { en: "Update", zh: "动态" },
  };

  return locale === "en" ? labels[collection].en : labels[collection].zh;
};

const getPreviewTitle = (
  document: PreviewDocument,
  collection: PreviewCollectionSlug,
  fallbackId: string,
) => {
  if ("title" in document && typeof document.title === "string" && document.title.trim()) {
    return document.title;
  }

  if ("content" in document && typeof document.content === "string" && document.content.trim()) {
    return document.content.slice(0, 32);
  }

  return `${getCollectionLabel(collection, "zh")} #${fallbackId}`;
};

const renderPreviewDocument = ({
  collection,
  document,
  id,
  locale,
}: {
  collection: PreviewCollectionSlug;
  document: PreviewDocument;
  id: string;
  locale: SiteLocale;
}) => {
  switch (collection) {
    case "posts": {
      const post = document as Post;

      return (
        <article className="grid gap-6 xl:grid-cols-[0.88fr_1.52fr]">
          <aside className="sunny-card rounded-[2.2rem] p-8">
            <p className="sunny-kicker text-xs text-muted">{locale === "en" ? "Overview" : "概览"}</p>
            <h2 className="sunny-display mt-4 text-4xl leading-none text-foreground md:text-5xl">
              {post.title}
            </h2>
            <p className="mt-5 text-base leading-8 text-muted">{post.summary}</p>

            <div className="mt-8 space-y-4 border-t border-border pt-6 text-sm text-muted">
              <div className="flex items-center justify-between gap-3">
                <span>{locale === "en" ? "Published" : "发布时间"}</span>
                <span className="text-foreground">{formatDate(post.publishedAt, locale)}</span>
              </div>
            </div>
          </aside>

          <div className="sunny-card sunny-card-strong overflow-hidden rounded-[2.2rem]">
            <RecordCoverImage
              containerClassName="border-b border-border"
              imageClassName="h-[280px] w-full object-cover md:h-[380px]"
              preferredSize="card"
              priority
              record={post as unknown as Record<string, unknown>}
            />

            <div className="p-8 md:p-10">
              <RichTextContent data={post.content} />
            </div>
          </div>
        </article>
      );
    }

    case "pages": {
      const page = document as Page;

      return (
        <article className="sunny-card rounded-[1.9rem] p-6 md:p-8">
          <RecordCoverImage
            containerClassName="mb-6 overflow-hidden rounded-[1.45rem] border border-border/80"
            imageClassName="h-64 w-full object-cover md:h-80"
            preferredSize="card"
            priority
            record={page as unknown as Record<string, unknown>}
          />
          <RichTextContent data={page.content} />
        </article>
      );
    }

    case "notes": {
      const note = document as Note;

      return (
        <article className="sunny-card rounded-[1.7rem] p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sunny-badge sunny-badge-accent">{note.category}</span>
            {note.mood ? <span className="sunny-badge sunny-badge-muted">{note.mood}</span> : null}
          </div>
          <p className="mt-5 text-base leading-8 text-foreground md:text-lg">{note.content}</p>
          <RecordCoverImage
            containerClassName="mt-6 overflow-hidden rounded-[1.35rem] border border-border/80"
            imageClassName="h-56 w-full object-cover"
            preferredSize="card"
            record={note as unknown as Record<string, unknown>}
          />
        </article>
      );
    }

    case "updates": {
      const update = document as Update;

      return (
        <article className="sunny-card rounded-[1.7rem] p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sunny-badge sunny-badge-accent">{update.type}</span>
            <span className="text-sm text-muted">{formatDateTime(update.updatedAt, locale)}</span>
          </div>
          <p className="mt-5 text-base leading-8 text-foreground md:text-lg">{update.content}</p>
          {update.link ? (
            <Link href={update.link} className="mt-4 inline-flex text-sm font-semibold text-accent-strong">
              {update.link}
            </Link>
          ) : null}
          <RecordCoverImage
            containerClassName="mt-6 overflow-hidden rounded-[1.35rem] border border-border/80"
            imageClassName="h-56 w-full object-cover"
            preferredSize="card"
            record={update as unknown as Record<string, unknown>}
          />
        </article>
      );
    }

    case "checklists": {
      const checklist = document as Checklist;

      return (
        <div className="space-y-6">
          <ChecklistPreviewCard checklist={checklist} locale={locale} />
          <section className="sunny-card rounded-[1.8rem] p-6 md:p-8">
            <div className="space-y-4">
              {(checklist.groups ?? []).map((group, groupIndex) => (
                <div
                  key={group.id ?? `${id}-${groupIndex}`}
                  className="rounded-[1.25rem] border border-border bg-white/60 p-5"
                >
                  <h3 className="text-lg font-semibold text-foreground">{group.title}</h3>
                  <div className="mt-4 space-y-3">
                    {(group.items ?? []).map((item, itemIndex) => (
                      <div
                        key={item.id ?? `${group.id ?? "group"}-${itemIndex}`}
                        className="rounded-[1rem] border border-border/80 bg-background/60 px-4 py-3"
                      >
                        <div className="flex items-start gap-3">
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
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      );
    }

    case "timeline-events":
    default: {
      const event = document as TimelineEvent;

      return (
        <article className="sunny-card rounded-[1.9rem] p-6 md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="sunny-badge sunny-badge-accent">{event.type}</span>
            <span className="text-sm text-muted">{formatDate(event.eventDate, locale)}</span>
          </div>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-foreground">{event.title}</h2>
          {event.description ? (
            <p className="mt-4 text-base leading-8 text-muted">{event.description}</p>
          ) : (
            <p className="mt-4 text-base leading-8 text-muted">
              {locale === "en"
                ? "Add more context to explain why this node matters."
                : "可以继续补充这条时间线节点的重要性说明。"}
            </p>
          )}
        </article>
      );
    }
  }
};
