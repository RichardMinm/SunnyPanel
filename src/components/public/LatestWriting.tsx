import Link from "next/link";

import type { Note, Post, Update } from "@/payload-types";

import { EmptyState, SectionHeader, StatusBadge, SurfaceCard } from "@/components/ui/SunnyComponents";
import { formatShortDate } from "@/lib/formatters";
import { getContentTextFallback } from "@/lib/rich-content/compat";
import type { SiteLocale } from "@/lib/site-copy";

type LatestWritingProps = {
  locale: SiteLocale;
  notes: Note[];
  posts: Post[];
  updates: Update[];
};

type WritingItem = {
  date: string;
  description: string;
  href: string;
  id: string;
  label: string;
  sortDate: string;
  title: string;
  tone: "accent" | "info" | "success";
};

const latestWritingCopy = {
  en: {
    action: "Open Writing",
    description:
      "Posts carry the long-form thinking; notes and updates keep the smaller signals visible between essays.",
    emptyBody: "Publish a Post, Note, or Update and this section will become the homepage writing stream.",
    emptyTitle: "No writing yet",
    kicker: "Latest Writing",
    noteLabel: "Note",
    noteTitle: "Note",
    postLabel: "Post",
    title: "Recent Signals",
    updateLabel: "Update",
  },
  zh: {
    action: "打开写作",
    description: "文章承载长思考，短札和动态把两篇文章之间的小信号也留在首页。",
    emptyBody: "发布 Post、Note 或 Update 后，这里会自动形成首页的最新写作流。",
    emptyTitle: "还没有写作内容",
    kicker: "Latest Writing",
    noteLabel: "Note",
    noteTitle: "短札",
    postLabel: "Post",
    title: "最近信号",
    updateLabel: "Update",
  },
} as const;

const excerpt = (value: string, maxLength = 128) => {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trim()}...`;
};

const getWritingItems = ({
  locale,
  notes,
  posts,
  updates,
}: LatestWritingProps): WritingItem[] => {
  const copy = latestWritingCopy[locale];
  const postItems: WritingItem[] = posts.map((post) => ({
    date: formatShortDate(post.publishedAt ?? post.createdAt, locale),
    description: excerpt(post.summary),
    href: `/blog/${post.slug}`,
    id: `post-${post.id}`,
    label: copy.postLabel,
    sortDate: post.publishedAt ?? post.createdAt,
    title: post.title,
    tone: "accent",
  }));

  const noteItems: WritingItem[] = notes.map((note) => ({
    date: formatShortDate(note.createdAt, locale),
    description: excerpt(getContentTextFallback(note)),
    href: "/notes",
    id: `note-${note.id}`,
    label: note.mood || note.category || copy.noteLabel,
    sortDate: note.createdAt,
    title: note.category || copy.noteTitle,
    tone: "info",
  }));

  const updateItems: WritingItem[] = updates.map((update) => ({
    date: formatShortDate(update.createdAt, locale),
    description: excerpt(getContentTextFallback(update)),
    href: "/updates",
    id: `update-${update.id}`,
    label: update.type,
    sortDate: update.createdAt,
    title: copy.updateLabel,
    tone: "success",
  }));

  return [...postItems, ...noteItems, ...updateItems]
    .sort((first, second) => new Date(second.sortDate).getTime() - new Date(first.sortDate).getTime())
    .slice(0, 6);
};

export function LatestWriting(props: LatestWritingProps) {
  const copy = latestWritingCopy[props.locale];
  const items = getWritingItems(props);

  return (
    <SurfaceCard as="section" variant="default">
      <SectionHeader
        action={
          <Link href="/blog" className="sunny-button-secondary">
            {copy.action}
          </Link>
        }
        description={copy.description}
        kicker={copy.kicker}
        size="lg"
        title={copy.title}
      />

      <div className="mt-6">
        {items.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <Link key={item.id} href={item.href} className="sunny-writing-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge tone={item.tone}>{item.label}</StatusBadge>
                  <span className="text-xs text-muted">{item.date}</span>
                </div>
                <h3 className="mt-4 text-base font-semibold leading-7 text-foreground">{item.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{item.description}</p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState description={copy.emptyBody} title={copy.emptyTitle} />
        )}
      </div>
    </SurfaceCard>
  );
}
