"use client";

import type { Editor } from "@tiptap/core";

import { uploadDashboardImage } from "@/lib/editor/upload-dashboard-image";
import { uploadDashboardMedia } from "@/lib/editor/upload-dashboard-media";

import type { SlashCommandIconName } from "./SlashCommandIcon";

export type SlashCommandGroup =
  | "basic"
  | "list"
  | "media"
  | "advanced"
  | "insert"
  | "callout";

export type SlashCommandItem = {
  command: (editor: Editor) => boolean | Promise<void> | void;
  group: SlashCommandGroup;
  icon: SlashCommandIconName;
  id: string;
  keywords: string[];
  label: string;
  shortcut?: string;
};

export const slashCommandGroupLabels: Record<SlashCommandGroup, string> = {
  basic: "基础",
  list: "列表",
  media: "媒体",
  advanced: "高级块",
  insert: "插入",
  callout: "提示框",
};

const pickFile = (accept: string) =>
  new Promise<File | null>((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });

const promptText = (message: string, defaultValue = "") => {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.prompt(message, defaultValue)?.trim();
  return value || null;
};

const insertCallout = (editor: Editor, tone: string) => {
  editor
    .chain()
    .focus()
    .insertContent({
      attrs: { tone },
      content: [{ type: "paragraph" }],
      type: "callout",
    })
    .run();
};

const insertMediaEmbed = (
  editor: Editor,
  kind: "file" | "pdf" | "video",
  src: string,
  title: string,
  filename = "",
) => {
  editor
    .chain()
    .focus()
    .insertContent({
      attrs: { filename, kind, src, title },
      type: "mediaEmbed",
    })
    .run();
};

const formatDate = () =>
  new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

const formatTime = () =>
  new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

const formatDateTime = () =>
  new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());

export const slashCommandItems: SlashCommandItem[] = [
  {
    command: (editor) => editor.chain().focus().setParagraph().run(),
    group: "basic",
    icon: "paragraph",
    id: "paragraph",
    keywords: ["paragraph", "text", "正文"],
    label: "正文",
  },
  {
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    group: "basic",
    icon: "heading1",
    id: "heading-1",
    keywords: ["h1", "heading", "标题"],
    label: "标题 1",
    shortcut: "⌃⇧1",
  },
  {
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    group: "basic",
    icon: "heading2",
    id: "heading-2",
    keywords: ["h2", "heading", "标题"],
    label: "标题 2",
    shortcut: "⌃⇧2",
  },
  {
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    group: "basic",
    icon: "heading3",
    id: "heading-3",
    keywords: ["h3", "heading", "标题"],
    label: "标题 3",
    shortcut: "⌃⇧3",
  },
  {
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
    group: "list",
    icon: "taskList",
    id: "task-list",
    keywords: ["task", "todo", "任务"],
    label: "任务列表",
    shortcut: "⌃⇧7",
  },
  {
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
    group: "list",
    icon: "bulletList",
    id: "bullet-list",
    keywords: ["list", "bullet", "无序"],
    label: "无序列表",
    shortcut: "⌃⇧8",
  },
  {
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
    group: "list",
    icon: "orderedList",
    id: "ordered-list",
    keywords: ["ordered", "有序"],
    label: "有序列表",
    shortcut: "⌃⇧9",
  },
  {
    command: async (editor) => {
      const file = await pickFile("image/*");
      if (!file) {
        return;
      }

      const uploaded = await uploadDashboardImage(file);
      editor.chain().focus().setImage({ alt: file.name, src: uploaded.url }).run();
    },
    group: "media",
    icon: "image",
    id: "image",
    keywords: ["image", "photo", "图片"],
    label: "图片",
    shortcut: "⌘⇧I",
  },
  {
    command: async (editor) => {
      const url = promptText("视频地址（https://）");
      if (url) {
        insertMediaEmbed(editor, "video", url, "视频", "");
        return;
      }

      const file = await pickFile("video/*");
      if (!file) {
        return;
      }

      const uploaded = await uploadDashboardMedia(file, file.name);
      insertMediaEmbed(editor, "video", uploaded.url, file.name, file.name);
    },
    group: "media",
    icon: "video",
    id: "video",
    keywords: ["video", "视频"],
    label: "视频",
    shortcut: "⌘⇧V",
  },
  {
    command: async (editor) => {
      const file = await pickFile("application/pdf,.pdf");
      if (!file) {
        return;
      }

      const uploaded = await uploadDashboardMedia(file, file.name);
      insertMediaEmbed(editor, "pdf", uploaded.url, file.name, file.name);
    },
    group: "media",
    icon: "pdf",
    id: "pdf",
    keywords: ["pdf"],
    label: "PDF",
  },
  {
    command: async (editor) => {
      const file = await pickFile("*/*");
      if (!file) {
        return;
      }

      const uploaded = await uploadDashboardMedia(file, file.name);
      insertMediaEmbed(editor, "file", uploaded.url, file.name, file.name);
    },
    group: "media",
    icon: "attachment",
    id: "attachment",
    keywords: ["attachment", "file", "附件"],
    label: "附件",
  },
  {
    command: (editor) =>
      editor.chain().focus().insertTable({ cols: 3, rows: 3, withHeaderRow: true }).run(),
    group: "basic",
    icon: "table",
    id: "table",
    keywords: ["table", "表格"],
    label: "表格",
  },
  {
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
    group: "basic",
    icon: "quote",
    id: "quote",
    keywords: ["quote", "引用"],
    label: "引用",
    shortcut: "⌘]",
  },
  {
    command: (editor) => {
      const latex = promptText("输入 LaTeX 公式");
      if (!latex) {
        return;
      }

      editor.chain().focus().insertBlockMath({ latex }).run();
    },
    group: "advanced",
    icon: "math",
    id: "math",
    keywords: ["math", "latex", "数学"],
    label: "数学块 (LaTeX)",
  },
  {
    command: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent({
          content: [
            {
              content: [{ text: "切换标题", type: "text" }],
              type: "detailsSummary",
            },
            {
              content: [{ type: "paragraph" }],
              type: "detailsContent",
            },
          ],
          type: "details",
        })
        .run(),
    group: "advanced",
    icon: "toggle",
    id: "toggle",
    keywords: ["toggle", "details", "切换"],
    label: "切换块",
  },
  {
    command: (editor) => editor.chain().focus().setHorizontalRule().run(),
    group: "advanced",
    icon: "divider",
    id: "divider",
    keywords: ["divider", "hr", "分割线"],
    label: "分割线",
    shortcut: "⌘_",
  },
  {
    command: (editor) => editor.chain().focus().insertContent({ type: "pageBreak" }).run(),
    group: "advanced",
    icon: "pageBreak",
    id: "page-break",
    keywords: ["page", "break", "分页"],
    label: "分页符",
  },
  {
    command: (editor) => editor.chain().focus().insertContent(formatDate()).run(),
    group: "insert",
    icon: "date",
    id: "date",
    keywords: ["date", "日期"],
    label: "当前日期",
  },
  {
    command: (editor) => editor.chain().focus().insertContent(formatTime()).run(),
    group: "insert",
    icon: "time",
    id: "time",
    keywords: ["time", "时间"],
    label: "当前时间",
  },
  {
    command: (editor) => editor.chain().focus().insertContent(formatDateTime()).run(),
    group: "insert",
    icon: "datetime",
    id: "datetime",
    keywords: ["datetime", "日期时间"],
    label: "当前日期和时间",
  },
  {
    command: (editor) => editor.chain().focus().toggleCodeBlock({ language: "plaintext" }).run(),
    group: "basic",
    icon: "codeBlock",
    id: "code-block",
    keywords: ["code", "代码"],
    label: "代码块",
    shortcut: "⌘⇧C",
  },
  {
    command: (editor) => insertCallout(editor, "info"),
    group: "callout",
    icon: "calloutInfo",
    id: "callout-info",
    keywords: ["info", "tip", "提示"],
    label: "提示信息",
  },
  {
    command: (editor) => insertCallout(editor, "success"),
    group: "callout",
    icon: "calloutSuccess",
    id: "callout-success",
    keywords: ["success", "成功"],
    label: "成功通知",
  },
  {
    command: (editor) => insertCallout(editor, "warning"),
    group: "callout",
    icon: "calloutWarning",
    id: "callout-warning",
    keywords: ["warning", "警告"],
    label: "警告信息",
  },
];

export function filterSlashCommandItems(query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return slashCommandItems;
  }

  return slashCommandItems.filter((item) => {
    const haystack = [item.label, ...item.keywords].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}

export function groupSlashCommandItems(items: SlashCommandItem[]) {
  const order: SlashCommandGroup[] = ["basic", "list", "media", "advanced", "insert", "callout"];
  return order
    .map((group) => ({
      group,
      items: items.filter((item) => item.group === group),
      label: slashCommandGroupLabels[group],
    }))
    .filter((entry) => entry.items.length > 0);
}
