import { NextResponse } from "next/server";

import type { AgentThread, Note, Page, Plan, Post, TimelineEvent, Update } from "@/payload-types";
import {
  commandItemMatchesQuery,
  getStaticCommandItems,
  groupCommandItems,
  type CommandSearchItem,
} from "@/lib/command/palette";
import { publicContentConstraint } from "@/lib/payload/access";
import { getPayloadAuthResult } from "@/lib/payload/auth";
import { getPayloadClient } from "@/lib/payload/client";
import type { SiteLocale } from "@/lib/site-copy";

const maxQueryLength = 80;

const parseLocale = (value: null | string): SiteLocale => (value === "en" ? "en" : "zh");

const summarizeText = (value: string, fallback: string, maxLength = 72) => {
  const normalized = value.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return fallback;
  }

  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength).trimEnd()}...`;
};

const compactStrings = (...values: unknown[]) =>
  values.filter((value): value is string => typeof value === "string" && value.length > 0);

const getAdminHref = (collection: string, id: number) => `/admin/collections/${collection}/${id}`;

const isPublicDocument = (doc: { status?: null | string; visibility?: null | string }) =>
  doc.status === "published" && doc.visibility === "public";

const getPublicOrAdminHref = ({
  adminCollection,
  doc,
  publicHref,
}: {
  adminCollection: string;
  doc: { id: number; status?: null | string; visibility?: null | string };
  publicHref: string;
}) => (isPublicDocument(doc) ? publicHref : getAdminHref(adminCollection, doc.id));

const byUpdatedAtDesc = (left: CommandSearchItem, right: CommandSearchItem) =>
  new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime();

const createPageItem = (page: Page): CommandSearchItem => ({
  group: "pages",
  href: getPublicOrAdminHref({
    adminCollection: "pages",
    doc: page,
    publicHref: `/${page.slug}`,
  }),
  id: `page:${page.id}`,
  keywords: compactStrings(page.slug, page.status, page.visibility),
  kind: "Page",
  source: "pages",
  subtitle: isPublicDocument(page) ? `/${page.slug}` : `Admin page · ${page.status}`,
  title: page.title,
  updatedAt: page.updatedAt,
});

const createPostItem = (post: Post): CommandSearchItem => ({
  group: "writing",
  href: getPublicOrAdminHref({
    adminCollection: "posts",
    doc: post,
    publicHref: `/blog/${post.slug}`,
  }),
  id: `post:${post.id}`,
  keywords: compactStrings(post.slug, post.summary, ...(post.tags ?? [])),
  kind: "Post",
  source: "posts",
  subtitle: post.summary,
  title: post.title,
  updatedAt: post.updatedAt,
});

const createNoteItem = (note: Note): CommandSearchItem => ({
  group: "writing",
  href: isPublicDocument(note) ? "/notes" : getAdminHref("notes", note.id),
  id: `note:${note.id}`,
  keywords: compactStrings(note.category, note.mood, note.status, note.visibility),
  kind: "Note",
  source: "notes",
  subtitle: note.category,
  title: summarizeText(note.content, "Untitled Note"),
  updatedAt: note.updatedAt,
});

const createUpdateItem = (update: Update): CommandSearchItem => ({
  group: "writing",
  href: isPublicDocument(update) ? "/updates" : getAdminHref("updates", update.id),
  id: `update:${update.id}`,
  keywords: compactStrings(update.type, update.link, update.status, update.visibility),
  kind: "Update",
  source: "updates",
  subtitle: update.type,
  title: summarizeText(update.content, "Untitled Update"),
  updatedAt: update.updatedAt,
});

const createPlanItem = (plan: Plan): CommandSearchItem => ({
  group: "plans",
  href: getAdminHref("plans", plan.id),
  id: `plan:${plan.id}`,
  keywords: compactStrings(plan.description, plan.priority, plan.state, plan.agentState, plan.executionMode),
  kind: "Plan",
  source: "plans",
  subtitle: `${plan.state} · ${plan.priority} · ${plan.executionMode}`,
  title: plan.title,
  updatedAt: plan.updatedAt,
});

const createTimelineItem = (event: TimelineEvent): CommandSearchItem => ({
  group: "timeline",
  href: isPublicDocument(event) ? "/timeline" : getAdminHref("timeline-events", event.id),
  id: `timeline:${event.id}`,
  keywords: compactStrings(event.description, event.type, event.status, event.visibility),
  kind: "Timeline",
  source: "timeline-events",
  subtitle: event.eventDate,
  title: event.title,
  updatedAt: event.updatedAt,
});

const createAgentThreadItem = (thread: AgentThread): CommandSearchItem => ({
  group: "agent",
  href: `/dashboard?threadId=${thread.id}`,
  id: `agent-thread:${thread.id}`,
  keywords: compactStrings(thread.lastIntent, thread.lastEngine, thread.status),
  kind: "Agent Thread",
  source: "agent-threads",
  subtitle: thread.lastInteractionAt ? `Thread #${thread.id} · ${thread.lastInteractionAt}` : `Thread #${thread.id}`,
  title: thread.title,
  updatedAt: thread.lastInteractionAt ?? thread.updatedAt,
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, maxQueryLength);
  const locale = parseLocale(url.searchParams.get("locale"));
  const includePrivate = url.searchParams.get("scope") === "private";
  const payload = await getPayloadClient();
  const authResult = await getPayloadAuthResult();
  const canReadPrivate = Boolean(authResult.user && includePrivate);
  const publicOnly = !canReadPrivate;
  const contentWhere = publicOnly ? publicContentConstraint() : undefined;
  const contentLimit = query ? 24 : 10;

  const [pages, posts, notes, updates, timelineEvents, plans, agentThreads] = await Promise.all([
    payload.find({
      collection: "pages",
      depth: 0,
      limit: contentLimit,
      overrideAccess: true,
      sort: publicOnly ? "title" : "-updatedAt",
      where: contentWhere,
    }),
    payload.find({
      collection: "posts",
      depth: 0,
      limit: contentLimit,
      overrideAccess: true,
      sort: "-updatedAt",
      where: contentWhere,
    }),
    payload.find({
      collection: "notes",
      depth: 0,
      limit: contentLimit,
      overrideAccess: true,
      sort: "-updatedAt",
      where: contentWhere,
    }),
    payload.find({
      collection: "updates",
      depth: 0,
      limit: contentLimit,
      overrideAccess: true,
      sort: "-updatedAt",
      where: contentWhere,
    }),
    payload.find({
      collection: "timeline-events",
      depth: 0,
      limit: contentLimit,
      overrideAccess: true,
      sort: "-eventDate",
      where: contentWhere,
    }),
    canReadPrivate
      ? payload.find({
          collection: "plans",
          depth: 0,
          limit: contentLimit,
          overrideAccess: true,
          sort: "-updatedAt",
        })
      : Promise.resolve({ docs: [] as Plan[] }),
    canReadPrivate && authResult.user
      ? payload.find({
          collection: "agent-threads",
          depth: 0,
          limit: contentLimit,
          overrideAccess: true,
          sort: "-lastInteractionAt",
          where: {
            user: {
              equals: authResult.user.id,
            },
          },
        })
      : Promise.resolve({ docs: [] as AgentThread[] }),
  ]);

  const staticItems = getStaticCommandItems(locale);
  const writingItems = [
    ...posts.docs.map((doc) => createPostItem(doc as Post)),
    ...notes.docs.map((doc) => createNoteItem(doc as Note)),
    ...updates.docs.map((doc) => createUpdateItem(doc as Update)),
  ].sort(byUpdatedAtDesc);
  const dynamicItems = [
    ...pages.docs.map((doc) => createPageItem(doc as Page)),
    ...writingItems,
    ...plans.docs.map((doc) => createPlanItem(doc as Plan)),
    ...timelineEvents.docs.map((doc) => createTimelineItem(doc as TimelineEvent)),
    ...agentThreads.docs.map((doc) => createAgentThreadItem(doc as AgentThread)),
  ];
  const items = [...staticItems, ...dynamicItems]
    .filter((item) => commandItemMatchesQuery(item, query))
    .slice(0, 60);

  return NextResponse.json({
    groups: groupCommandItems(items, locale),
  });
}
