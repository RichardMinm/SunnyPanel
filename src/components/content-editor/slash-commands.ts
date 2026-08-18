"use client";

import type { Editor } from "@tiptap/core";

import type { WritingAssistAction } from "@/lib/agent/prompts/writing-assist";
import {
  getWorkflowActionDescription,
  runWritingWorkflowAction,
  type WritingWorkflowActionId,
} from "@/lib/dashboard/writing-workflow-actions";
import { uploadDashboardImage, uploadDashboardMedia } from "@/lib/editor/upload-dashboard-image";

import type { SlashCommandIconName } from "./SlashCommandIcon";

export type SlashCommandGroup = "ai" | "blocks" | "common" | "lists" | "time" | "workflow";

export type SlashCommandKind = "ai" | "block" | "insert" | "workflow";

export type WritingAssistSelection = Readonly<{
  applyResult: (value: string) => boolean;
  isCurrent: () => boolean;
  text: string;
}>;

export type SlashCommandHandlers = {
  onInternalLink?: (editor: Editor) => void;
  onWritingAssist?: (
    action: WritingAssistAction,
    selection?: WritingAssistSelection,
  ) => void;
  onWorkflow?: (id: WritingWorkflowActionId) => void;
};

export type SlashCommandItem = {
  badge?: "chevron" | "shortcut";
  command: (editor: Editor) => boolean | Promise<void> | void;
  description: string;
  group: SlashCommandGroup;
  icon: SlashCommandIconName;
  id: string;
  keywords: string[];
  kind?: SlashCommandKind;
  label: string;
  shortcut?: string;
};

export const slashCommandGroupLabels: Record<SlashCommandGroup, string> = {
  ai: "AI",
  blocks: "内容块",
  common: "常用",
  lists: "列表",
  time: "时间",
  workflow: "SunnyPanel 工作流",
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

const insertUploadedMedia = async (
  editor: Editor,
  accept: string,
  kind: "file" | "pdf" | "video",
) => {
  const file = await pickFile(accept);
  if (!file) return;
  const uploaded = await uploadDashboardMedia(file);
  editor
    .chain()
    .focus()
    .insertContent({
      attrs: {
        filename: file.name,
        kind,
        src: uploaded.url,
        title: file.name,
      },
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

const aiCommand =
  (action: WritingAssistAction, handlers: SlashCommandHandlers) => (editor: Editor) => {
    const selectionActions = new Set<WritingAssistAction>([
      "condense",
      "expand",
      "polish",
      "rewrite",
    ]);
    if (!selectionActions.has(action)) {
      handlers.onWritingAssist?.(action);
      return editor.chain().focus().run();
    }

    const selection = editor.state.selection;
    const range = selection.empty
      ? { from: selection.$from.start(), to: selection.$from.end() }
      : { from: selection.from, to: selection.to };
    const selectedText = editor.state.doc
      .textBetween(range.from, range.to, "\n")
      .trim();
    const capturedDocument = JSON.stringify(editor.getJSON());
    const isCurrent = () =>
      JSON.stringify(editor.getJSON()) === capturedDocument
      && editor.state.doc.textBetween(range.from, range.to, "\n").trim()
        === selectedText;
    handlers.onWritingAssist?.(
      action,
      selectedText
        ? {
            applyResult: (value) => {
              if (!isCurrent()) return false;
              return editor.chain().focus().insertContentAt(range, value).run();
            },
            isCurrent,
            text: selectedText,
          }
        : undefined,
    );
    return editor.chain().focus().run();
  };

const workflowCommand =
  (id: WritingWorkflowActionId, handlers: SlashCommandHandlers) => (editor: Editor) => {
    handlers.onWorkflow?.(id);
    return editor.chain().focus().run();
  };

const internalLinkCommand = (handlers: SlashCommandHandlers) => (editor: Editor) => {
  handlers.onInternalLink?.(editor);
  return true;
};

export function createSlashCommandItems(handlers: SlashCommandHandlers = {}): SlashCommandItem[] {
  return [
    {
      command: (editor) => editor.chain().focus().setParagraph().run(),
      description: "普通段落文本",
      group: "common",
      icon: "paragraph",
      id: "paragraph",
      keywords: ["paragraph", "text", "正文", "p"],
      kind: "block",
      label: "正文",
    },
    {
      command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      description: "用于章节主标题",
      group: "common",
      icon: "heading1",
      id: "heading-1",
      keywords: ["h1", "heading", "标题", "标题1"],
      kind: "block",
      label: "标题 1",
      shortcut: "⌃⇧1",
    },
    {
      command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      description: "用于小节标题",
      group: "common",
      icon: "heading2",
      id: "heading-2",
      keywords: ["h2", "heading", "标题", "标题2"],
      kind: "block",
      label: "标题 2",
      shortcut: "⌃⇧2",
    },
    {
      command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      description: "用于段落小标题",
      group: "common",
      icon: "heading3",
      id: "heading-3",
      keywords: ["h3", "heading", "标题", "标题3"],
      kind: "block",
      label: "标题 3",
      shortcut: "⌃⇧3",
    },
    {
      command: (editor) => editor.chain().focus().toggleTaskList().run(),
      description: "可勾选的任务清单",
      group: "common",
      icon: "taskList",
      id: "task-list-common",
      keywords: ["task", "todo", "任务", "待办"],
      kind: "block",
      label: "任务列表",
      shortcut: "⌃⇧7",
    },
    {
      command: (editor) => editor.chain().focus().toggleBlockquote().run(),
      description: "引用段落或摘录",
      group: "common",
      icon: "quote",
      id: "quote",
      keywords: ["quote", "引用", "blockquote"],
      kind: "block",
      label: "引用",
      shortcut: "⌘]",
    },
    {
      command: (editor) =>
        editor.chain().focus().insertTable({ cols: 3, rows: 3, withHeaderRow: true }).run(),
      description: "插入可编辑表格",
      group: "blocks",
      icon: "table",
      id: "table",
      keywords: ["table", "表格", "grid"],
      kind: "block",
      label: "表格",
    },
    {
      command: (editor) => editor.chain().focus().toggleCodeBlock({ language: "plaintext" }).run(),
      description: "插入支持语法高亮的代码区域",
      group: "blocks",
      icon: "codeBlock",
      id: "code-block",
      keywords: ["code", "代码", "codeblock"],
      kind: "block",
      label: "代码块",
      shortcut: "⌘⇧C",
    },
    {
      command: async (editor) => {
        const file = await pickFile("image/*");
        if (!file) return;
        const uploaded = await uploadDashboardImage(file);
        editor.chain().focus().setImage({ alt: file.name, src: uploaded.url }).run();
      },
      description: "上传或插入图片",
      group: "blocks",
      icon: "image",
      id: "image",
      keywords: ["image", "photo", "图片", "img"],
      kind: "block",
      label: "图片",
      shortcut: "⌘⇧I",
    },
    {
      command: (editor) => editor.chain().focus().setHorizontalRule().run(),
      description: "在段落之间插入分割线",
      group: "blocks",
      icon: "divider",
      id: "divider",
      keywords: ["divider", "hr", "分割线", "分隔"],
      kind: "block",
      label: "分割线",
      shortcut: "⌘_",
    },
    {
      command: (editor) => insertCallout(editor, "info"),
      description: "突出提示或说明信息",
      group: "blocks",
      icon: "calloutInfo",
      id: "callout-info",
      keywords: ["callout", "info", "tip", "提示"],
      kind: "block",
      label: "Callout",
    },
    {
      command: (editor) => insertCallout(editor, "success"),
      description: "突出结论或已完成事项",
      group: "blocks",
      icon: "calloutSuccess",
      id: "callout-success",
      keywords: ["callout", "success", "完成", "结论"],
      kind: "block",
      label: "成功提示",
    },
    {
      command: (editor) => insertCallout(editor, "warning"),
      description: "突出风险或注意事项",
      group: "blocks",
      icon: "calloutWarning",
      id: "callout-warning",
      keywords: ["callout", "warning", "警告", "注意"],
      kind: "block",
      label: "警告提示",
    },
    {
      command: (editor) => editor.chain().focus().setDetails().run(),
      description: "插入可展开和收起的内容",
      group: "blocks",
      icon: "toggle",
      id: "details",
      keywords: ["details", "toggle", "折叠", "展开"],
      kind: "block",
      label: "折叠内容",
    },
    {
      command: (editor) => {
        const latex = window.prompt("输入 LaTeX 公式")?.trim();
        if (latex) editor.chain().focus().insertBlockMath({ latex }).run();
      },
      description: "插入块级数学公式",
      group: "blocks",
      icon: "math",
      id: "math",
      keywords: ["math", "latex", "公式", "数学"],
      kind: "block",
      label: "数学公式",
    },
    {
      command: (editor) => editor.chain().focus().insertContent({ type: "pageBreak" }).run(),
      description: "在导出和打印时从新页开始",
      group: "blocks",
      icon: "pageBreak",
      id: "page-break",
      keywords: ["page", "break", "分页", "换页"],
      kind: "block",
      label: "分页符",
    },
    {
      command: (editor) => insertUploadedMedia(editor, "application/pdf", "pdf"),
      description: "上传并链接 PDF 文档",
      group: "blocks",
      icon: "pdf",
      id: "pdf",
      keywords: ["pdf", "文档", "附件"],
      kind: "block",
      label: "PDF",
    },
    {
      command: (editor) => insertUploadedMedia(editor, "video/mp4,video/webm", "video"),
      description: "上传 MP4 或 WebM 视频",
      group: "blocks",
      icon: "video",
      id: "video",
      keywords: ["video", "视频", "mp4", "webm"],
      kind: "block",
      label: "视频",
    },
    {
      command: (editor) =>
        insertUploadedMedia(
          editor,
          ".pdf,.txt,.md,.csv,.zip,application/pdf,text/plain,text/markdown,text/csv,application/zip",
          "file",
        ),
      description: "上传并链接资料文件",
      group: "blocks",
      icon: "attachment",
      id: "attachment",
      keywords: ["attachment", "file", "附件", "文件"],
      kind: "block",
      label: "附件",
    },
    {
      command: (editor) => editor.chain().focus().toggleBulletList().run(),
      description: "项目符号列表",
      group: "lists",
      icon: "bulletList",
      id: "bullet-list",
      keywords: ["list", "bullet", "无序", "ul"],
      kind: "block",
      label: "无序列表",
      shortcut: "⌃⇧8",
    },
    {
      command: (editor) => editor.chain().focus().toggleOrderedList().run(),
      description: "编号步骤列表",
      group: "lists",
      icon: "orderedList",
      id: "ordered-list",
      keywords: ["ordered", "有序", "ol", "编号"],
      kind: "block",
      label: "有序列表",
      shortcut: "⌃⇧9",
    },
    {
      command: (editor) => editor.chain().focus().toggleTaskList().run(),
      description: "带复选框的任务项",
      group: "lists",
      icon: "taskList",
      id: "task-list",
      keywords: ["task", "todo", "任务列表"],
      kind: "block",
      label: "任务列表",
      shortcut: "⌃⇧7",
    },
    {
      command: (editor) => editor.chain().focus().insertContent(formatDate()).run(),
      description: "插入今天的日期",
      group: "time",
      icon: "date",
      id: "date",
      keywords: ["date", "日期", "今天"],
      kind: "insert",
      label: "当前日期",
    },
    {
      command: (editor) => editor.chain().focus().insertContent(formatTime()).run(),
      description: "插入当前时刻",
      group: "time",
      icon: "time",
      id: "time",
      keywords: ["time", "时间", "时刻"],
      kind: "insert",
      label: "当前时间",
    },
    {
      command: (editor) => editor.chain().focus().insertContent(formatDateTime()).run(),
      description: "日期与时间一起插入",
      group: "time",
      icon: "datetime",
      id: "datetime",
      keywords: ["datetime", "日期时间"],
      kind: "insert",
      label: "当前日期和时间",
    },
    {
      command: internalLinkCommand(handlers),
      description: "引用知识库中的另一篇文档",
      group: "common",
      icon: "attachment",
      id: "internal-document-link",
      keywords: ["link", "document", "引用", "文档链接", "知识库"],
      kind: "insert",
      label: "链接到文档",
    },
    {
      command: aiCommand("continue", handlers),
      description: "根据当前上下文继续写作",
      group: "ai",
      icon: "aiSpark",
      id: "ai-continue",
      keywords: ["ai", "continue", "续写", "写作"],
      kind: "ai",
      label: "AI 续写",
      badge: "chevron",
    },
    {
      command: aiCommand("summarize", handlers),
      description: "生成一段简明摘要",
      group: "ai",
      icon: "aiSummary",
      id: "ai-summarize",
      keywords: ["ai", "summary", "总结", "摘要"],
      kind: "ai",
      label: "总结本文",
      badge: "chevron",
    },
    {
      command: aiCommand("generate_outline", handlers),
      description: "根据正文生成章节大纲",
      group: "ai",
      icon: "aiOutline",
      id: "ai-outline",
      keywords: ["ai", "outline", "大纲", "结构"],
      kind: "ai",
      label: "生成大纲",
      badge: "chevron",
    },
    {
      command: aiCommand("rewrite", handlers),
      description: "改写选中或当前段落",
      group: "ai",
      icon: "aiRewrite",
      id: "ai-rewrite",
      keywords: ["ai", "rewrite", "改写", "润色"],
      kind: "ai",
      label: "改写选中内容",
      badge: "chevron",
    },
    {
      command: aiCommand("extract_tags", handlers),
      description: "从正文提取 3–8 个标签",
      group: "ai",
      icon: "aiTags",
      id: "ai-tags",
      keywords: ["ai", "tags", "标签", "tag"],
      kind: "ai",
      label: "提取标签",
      badge: "chevron",
    },
    {
      command: workflowCommand("checklist_from_doc", handlers),
      description: getWorkflowActionDescription("checklist_from_doc"),
      group: "workflow",
      icon: "wfChecklist",
      id: "wf-checklist",
      keywords: ["checklist", "清单", "任务"],
      kind: "workflow",
      label: "从本文生成清单",
      badge: "chevron",
    },
    {
      command: workflowCommand("plan_from_doc", handlers),
      description: getWorkflowActionDescription("plan_from_doc"),
      group: "workflow",
      icon: "wfPlan",
      id: "wf-plan",
      keywords: ["plan", "计划", "里程碑"],
      kind: "workflow",
      label: "从本文生成计划",
      badge: "chevron",
    },
    {
      command: workflowCommand("memory_from_doc", handlers),
      description: getWorkflowActionDescription("memory_from_doc"),
      group: "workflow",
      icon: "wfMemory",
      id: "wf-memory",
      keywords: ["memory", "记忆", "保存"],
      kind: "workflow",
      label: "保存为记忆",
      badge: "chevron",
    },
    {
      command: workflowCommand("timeline_from_doc", handlers),
      description: getWorkflowActionDescription("timeline_from_doc"),
      group: "workflow",
      icon: "wfTimeline",
      id: "wf-timeline",
      keywords: ["timeline", "时间线", "节点"],
      kind: "workflow",
      label: "记录为时间线节点",
      badge: "chevron",
    },
    {
      command: workflowCommand("plan_continue", handlers),
      description: getWorkflowActionDescription("plan_continue"),
      group: "workflow",
      icon: "aiSpark",
      id: "wf-plan-continue",
      keywords: ["plan", "continue", "续写", "计划"],
      kind: "workflow",
      label: "根据当前计划续写",
      badge: "chevron",
    },
    {
      command: workflowCommand("schedule_weekly", handlers),
      description: getWorkflowActionDescription("schedule_weekly"),
      group: "workflow",
      icon: "wfSchedule",
      id: "wf-schedule-weekly",
      keywords: ["schedule", "日程", "周记", "weekly"],
      kind: "workflow",
      label: "根据最近日程生成周记",
      badge: "chevron",
    },
  ];
}

/** @deprecated Use createSlashCommandItems — kept for tests defaulting to empty handlers */
export const slashCommandItems = createSlashCommandItems();

export function filterSlashCommandItems(query: string, items = slashCommandItems) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return items;
  }

  return items.filter((item) => {
    const haystack = [item.label, item.description, ...item.keywords].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}

export function groupSlashCommandItems(items: SlashCommandItem[]) {
  const order: SlashCommandGroup[] = ["common", "blocks", "lists", "time", "ai", "workflow"];
  return order
    .map((group) => ({
      group,
      items: items.filter((item) => item.group === group),
      label: slashCommandGroupLabels[group],
    }))
    .filter((entry) => entry.items.length > 0);
}

export { runWritingWorkflowAction, type WritingWorkflowActionId };
