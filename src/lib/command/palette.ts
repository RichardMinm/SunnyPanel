import type { SiteLocale } from "@/lib/site-copy";

export type CommandGroupId = "actions" | "agent" | "pages" | "plans" | "timeline" | "writing";

export type CommandSearchItem = {
  group: CommandGroupId;
  href: string;
  id: string;
  keywords?: string[];
  kind: string;
  source: "agent-threads" | "notes" | "pages" | "plans" | "posts" | "static" | "timeline-events" | "updates";
  subtitle?: string;
  title: string;
  updatedAt?: string;
};

export type CommandSearchGroup = {
  id: CommandGroupId;
  items: CommandSearchItem[];
  label: string;
};

export type CommandSearchResponse = {
  groups: CommandSearchGroup[];
};

export const commandGroupOrder: CommandGroupId[] = ["actions", "pages", "writing", "plans", "timeline", "agent"];

export const commandGroupLabels: Record<SiteLocale, Record<CommandGroupId, string>> = {
  en: {
    actions: "Actions",
    agent: "Agent",
    pages: "Pages",
    plans: "Plans",
    timeline: "Timeline",
    writing: "Writing",
  },
  zh: {
    actions: "Actions",
    agent: "Agent",
    pages: "Pages",
    plans: "Plans",
    timeline: "Timeline",
    writing: "Writing",
  },
};

export const getCommandGroupLabel = (group: CommandGroupId, locale: SiteLocale) =>
  commandGroupLabels[locale][group];

const createStaticItem = ({
  group,
  href,
  id,
  keywords,
  kind,
  subtitle,
  title,
}: Omit<CommandSearchItem, "source">): CommandSearchItem => ({
  group,
  href,
  id: `static:${id}`,
  keywords,
  kind,
  source: "static",
  subtitle,
  title,
});

export const getStaticCommandItems = (locale: SiteLocale): CommandSearchItem[] => {
  const isEn = locale === "en";

  return [
    createStaticItem({
      group: "pages",
      href: "/",
      id: "home",
      keywords: ["home", "index", "首页"],
      kind: isEn ? "Page" : "页面",
      subtitle: "/",
      title: isEn ? "Go to Home" : "前往首页",
    }),
    createStaticItem({
      group: "pages",
      href: "/dashboard",
      id: "dashboard",
      keywords: ["dashboard", "workspace", "工作台", "私有"],
      kind: isEn ? "Workspace" : "工作台",
      subtitle: "/dashboard",
      title: isEn ? "Go to Dashboard" : "前往工作台",
    }),
    createStaticItem({
      group: "pages",
      href: "/now",
      id: "now",
      keywords: ["now", "current", "当前", "近况"],
      kind: isEn ? "Page" : "页面",
      subtitle: "/now",
      title: isEn ? "Go to Now" : "前往 Now",
    }),
    createStaticItem({
      group: "writing",
      href: "/blog",
      id: "blog",
      keywords: ["blog", "post", "writing", "文章", "写作"],
      kind: isEn ? "Collection" : "集合",
      subtitle: "/blog",
      title: isEn ? "Go to Writing" : "前往写作",
    }),
    createStaticItem({
      group: "writing",
      href: "/notes",
      id: "notes",
      keywords: ["notes", "note", "短札", "笔记"],
      kind: isEn ? "Collection" : "集合",
      subtitle: "/notes",
      title: isEn ? "Go to Notes" : "前往 Notes",
    }),
    createStaticItem({
      group: "writing",
      href: "/updates",
      id: "updates",
      keywords: ["updates", "update", "动态"],
      kind: isEn ? "Collection" : "集合",
      subtitle: "/updates",
      title: isEn ? "Go to Updates" : "前往 Updates",
    }),
    createStaticItem({
      group: "timeline",
      href: "/timeline",
      id: "timeline",
      keywords: ["timeline", "memory", "时间线", "记忆"],
      kind: isEn ? "Page" : "页面",
      subtitle: "/timeline",
      title: isEn ? "Go to Timeline" : "前往 Timeline",
    }),
    createStaticItem({
      group: "pages",
      href: "/projects",
      id: "projects",
      keywords: ["projects", "project", "项目"],
      kind: isEn ? "Page" : "页面",
      subtitle: "/projects",
      title: isEn ? "Go to Projects" : "前往 Projects",
    }),
    createStaticItem({
      group: "pages",
      href: "/about",
      id: "about",
      keywords: ["about", "profile", "介绍", "关于"],
      kind: isEn ? "Page" : "页面",
      subtitle: "/about",
      title: isEn ? "Go to About" : "前往 About",
    }),
    createStaticItem({
      group: "actions",
      href: "/admin",
      id: "admin",
      keywords: ["admin", "payload", "后台"],
      kind: isEn ? "Admin" : "后台",
      subtitle: "/admin",
      title: isEn ? "Go to Admin" : "前往后台",
    }),
    createStaticItem({
      group: "actions",
      href: "/admin/collections/posts/create",
      id: "new-post",
      keywords: ["new post", "post", "article", "文章"],
      kind: isEn ? "Create" : "新建",
      subtitle: "/admin/collections/posts/create",
      title: isEn ? "New Post" : "新建文章",
    }),
    createStaticItem({
      group: "actions",
      href: "/admin/collections/notes/create",
      id: "new-note",
      keywords: ["new note", "note", "短札"],
      kind: isEn ? "Create" : "新建",
      subtitle: "/admin/collections/notes/create",
      title: isEn ? "New Note" : "新建短札",
    }),
    createStaticItem({
      group: "actions",
      href: "/admin/collections/updates/create",
      id: "new-update",
      keywords: ["new update", "update", "动态"],
      kind: isEn ? "Create" : "新建",
      subtitle: "/admin/collections/updates/create",
      title: isEn ? "New Update" : "新建动态",
    }),
    createStaticItem({
      group: "actions",
      href: "/admin/collections/timeline-events/create",
      id: "new-timeline-event",
      keywords: ["new timeline", "timeline event", "时间线", "节点"],
      kind: isEn ? "Create" : "新建",
      subtitle: "/admin/collections/timeline-events/create",
      title: isEn ? "New Timeline Event" : "新建时间线节点",
    }),
    createStaticItem({
      group: "actions",
      href: "/admin/collections/plans/create",
      id: "new-plan",
      keywords: ["new plan", "plan", "计划"],
      kind: isEn ? "Create" : "新建",
      subtitle: "/admin/collections/plans/create",
      title: isEn ? "New Plan" : "新建计划",
    }),
    createStaticItem({
      group: "actions",
      href: "/admin/collections/checklists/create",
      id: "new-checklist",
      keywords: ["new checklist", "checklist", "清单", "任务"],
      kind: isEn ? "Create" : "新建",
      subtitle: "/admin/collections/checklists/create",
      title: isEn ? "New Checklist" : "新建清单",
    }),
    createStaticItem({
      group: "actions",
      href: "/admin/collections/media/create",
      id: "upload-media",
      keywords: ["upload", "media", "image", "媒体", "上传"],
      kind: isEn ? "Create" : "新建",
      subtitle: "/admin/collections/media/create",
      title: isEn ? "Upload Media" : "上传媒体",
    }),
  ];
};

export const normalizeCommandQuery = (value: string) => value.trim().toLowerCase();

export const commandItemMatchesQuery = (item: CommandSearchItem, query: string) => {
  const normalizedQuery = normalizeCommandQuery(query);

  if (!normalizedQuery) {
    return true;
  }

  const haystack = [item.title, item.subtitle, item.href, item.kind, ...(item.keywords ?? [])]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
};

export const groupCommandItems = (
  items: CommandSearchItem[],
  locale: SiteLocale,
): CommandSearchGroup[] =>
  commandGroupOrder
    .map((group) => ({
      id: group,
      items: items.filter((item) => item.group === group),
      label: getCommandGroupLabel(group, locale),
    }))
    .filter((group) => group.items.length > 0);
