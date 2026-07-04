import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

const readWritingCss = () =>
  [
    "sunny-dashboard-writing-layout.css",
    "sunny-dashboard-writing-library.css",
    "sunny-dashboard-writing-editor.css",
    "sunny-dashboard-writing-chrome.css",
    "sunny-dashboard-writing-inspector.css",
    "sunny-dashboard-writing-misc.css",
  ]
    .map((file) => read(`src/app/styles/${file}`))
    .join("\n");

describe("Dashboard Writing workspace contracts", () => {
  test("sidebar exposes Writing workspace and embeds library rail below modes", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");
    const sidebarModes = read("src/components/dashboard/sidebar/dashboard-sidebar-modes.ts");
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");

    assert.match(sidebarModes, /key: "writing"/);
    assert.match(sidebarModes, /label: "写作"/);
    assert.match(sidebar, /WritingLibraryRail/);
    assert.match(sidebar, /isWritingMode \? <WritingLibraryRail/);
    assert.match(shellCss, /\.sunny-dashboard-writing-library-section/);
    assert.doesNotMatch(
      shellCss,
      /\.sunny-dashboard-icon-bar\.is-writing-mode[\s\S]*\.sunny-dashboard-mode-row:not\(\.is-active\)[\s\S]*display:\s*none/,
    );
  });

  test("DashboardShell wraps writing mode with document and layout providers", () => {
    const shell = read("src/components/dashboard/DashboardShell.tsx");

    assert.match(shell, /WritingWorkspace/);
    assert.match(shell, /WritingDocumentsProvider/);
    assert.match(shell, /WritingLayoutProvider/);
    assert.match(shell, /WritingLibraryFiltersProvider/);
    assert.match(shell, /threadListMode="hidden"/);
    assert.match(shell, /writingMode=\{activeMode === "writing"\}/);
    assert.match(shell, /onPrefillComposer/);
    assert.match(shell, /isWritingMode/);
    assert.match(shell, /formatWritingBarLabel/);
    assert.match(shell, /SIDEBAR_PINNED_STORAGE_KEY/);
    assert.match(shell, /useState\(true\)/);
  });

  test("WritingWorkspace is editor-only and uses shared document context", () => {
    const workspace = read("src/components/dashboard/writing/WritingWorkspace.tsx");

    assert.match(workspace, /useWritingDocumentsContext/);
    assert.match(workspace, /WritingEditorPane/);
    assert.match(workspace, /WritingMetaPanel/);
    assert.doesNotMatch(workspace, /WritingLibrary/);
  });

  test("WritingMetaPanel exposes six inspector sections without manual save button", () => {
    const meta = read("src/components/dashboard/writing/WritingMetaPanel.tsx");

    for (const label of ["基本信息", "发布设置", "标签", "版本历史", "关联", "高级设置"]) {
      assert.match(meta, new RegExp(label));
    }
    assert.doesNotMatch(meta, /保存属性/);
  });

  test("WritingEditorPane exposes document chrome with inline summary and topbar actions", () => {
    const editorPane = read("src/components/dashboard/writing/WritingEditorPane.tsx");

    assert.match(editorPane, /showsSummaryField/);
    assert.match(editorPane, /写一句摘要，帮助自己快速理解这篇内容/);
    assert.match(editorPane, /sunny-writing-byline-chip/);
    assert.match(editorPane, /sunny-writing-summary-row/);
    assert.match(editorPane, /moreHorizontal/);
    assert.match(editorPane, /sunny-writing-topbar-preview/);
    assert.match(editorPane, /sunny-writing-topbar-more-menu/);
    assert.doesNotMatch(editorPane, /trigger="新建文档"/);
    assert.doesNotMatch(editorPane, /trigger="更多"/);
    assert.doesNotMatch(editorPane, /sunny-writing-editor-topbar-inner/);
  });

  test("library uses category groups, uncategorized bucket, and sidebar bottom actions", () => {
    const library = read("src/components/dashboard/writing/WritingLibrary.tsx");
    const header = read("src/components/dashboard/writing/WritingLibraryHeader.tsx");
    const bottomRail = read("src/components/dashboard/writing/WritingSidebarBottomRail.tsx");
    const emptyState = read("src/components/dashboard/writing/WritingEmptyState.tsx");
    const categoryGroup = read("src/components/dashboard/writing/WritingCategoryGroup.tsx");
    const sidebarSection = read("src/components/layout/SidebarSection.tsx");
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");
    const css = readWritingCss();

    assert.match(header, /sunny-writing-library-space-title/);
    assert.match(header, /文档集/);
    assert.doesNotMatch(header, /AppDropdownMenu/);
    assert.doesNotMatch(library, /WritingLibrarySearch/);
    assert.doesNotMatch(library, /WritingLibraryFooter/);
    assert.match(library, /WritingCategoryGroup/);
    assert.match(library, /WritingUncategorizedGroup/);
    assert.match(library, /useWritingLibraryFiltersContext/);
    assert.match(emptyState, /暂无文档集/);
    assert.match(emptyState, /点击新建文档集开始整理内容/);
    assert.match(categoryGroup, /暂无文档/);
    assert.match(bottomRail, /新建文档集/);
    assert.match(bottomRail, /AppDropdownMenu/);
    assert.match(bottomRail, /草稿/);
    assert.match(bottomRail, /归档/);
    assert.match(bottomRail, /搜索/);
    assert.match(bottomRail, /DashboardSettingsMenu/);
    assert.match(bottomRail, /SidebarSection/);
    assert.match(bottomRail, /className="sunny-writing-rail-section"/);
    assert.match(bottomRail, /title="内容"/);
    assert.match(bottomRail, /title="工具"/);
    assert.match(bottomRail, /sunny-writing-rail-section-actions/);
    assert.match(sidebarSection, /app-sidebar-section__title/);
    assert.match(bottomRail, /内容/);
    assert.match(bottomRail, /工具/);
    assert.match(bottomRail, /WritingLibrarySearchDialog/);
    assert.match(shellCss, /\.sunny-writing-rail-section/);
    assert.match(css, /\.sunny-writing-library\.is-embedded[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
    assert.match(shellCss, /\.sunny-writing-sidebar-bottom-rail/);
  });

  test("category groups and document rows use outline-style tree layout", () => {
    const group = read("src/components/dashboard/writing/WritingCategoryGroup.tsx");
    const row = read("src/components/dashboard/writing/WritingDocumentRow.tsx");
    const actions = read("src/components/dashboard/writing/WritingDocumentActions.tsx");
    const meta = read("src/components/dashboard/writing/writing-collection-meta.ts");
    const css = readWritingCss();

    assert.match(group, /sunny-writing-tree-row/);
    assert.match(group, /sunny-writing-tree-action/);
    assert.match(group, /name="plus"/);
    assert.match(meta, /WRITING_CATEGORY_ICON_PRESETS/);
    assert.match(meta, /WRITING_CATEGORY_TINT_PRESETS/);
    assert.doesNotMatch(row, /sunny-writing-document-type-icon/);
    assert.doesNotMatch(row, /sunny-writing-document-time/);
    assert.match(row, /sunny-writing-tree-row-wrap/);
    assert.match(actions, /移动到文档集/);
    assert.match(css, /--writing-tree-indent/);
    assert.match(css, /\.sunny-writing-tree-children[\s\S]*border-left:/);
    assert.match(css, /\.sunny-writing-tree-row-wrap\.is-active/);
    assert.match(css, /\.sunny-writing-document-title[\s\S]*white-space:\s*nowrap/);
    assert.match(css, /\.sunny-writing-category-group/);
    assert.match(css, /--writing-category-tint-accent/);
    assert.match(css, /\.sunny-writing-create-category-dialog/);
  });
});

describe("Dashboard Writing styling contracts", () => {
  test("global styles import the writing workspace stylesheet via dashboard bundle", () => {
    const dashboardBundle = read("src/app/styles/sunny-dashboard.css");
    const writingBundle = read("src/app/styles/sunny-dashboard-writing.css");

    assert.match(dashboardBundle, /sunny-dashboard-writing\.css/);
    assert.match(writingBundle, /sunny-dashboard-writing-layout\.css/);
    assert.match(writingBundle, /sunny-dashboard-writing-editor\.css/);
  });

  test("writing stylesheet defines a single-column editor surface with embedded library styles", () => {
    const css = readWritingCss();
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");

    assert.match(css, /\.sunny-writing-workspace/);
    assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.doesNotMatch(css, /grid-template-columns:\s*280px/);
    assert.match(css, /\.sunny-writing-library\.is-embedded/);
    assert.match(css, /\.sunny-writing-inspector-drawer/);
    assert.match(css, /\.sunny-writing-editor-canvas/);
    assert.match(css, /\.sunny-writing-document-header/);
    assert.match(shellCss, /\.sunny-dashboard-icon-bar\.is-writing-mode/);
  });

  test("writing editor column uses centered canvas without legacy bubble menu", () => {
    const css = readWritingCss();
    const contentEditor = read("src/components/content-editor/ContentEditor.tsx");

    assert.match(css, /width:\s*min\(100%,\s*48rem\)/);
    assert.match(css, /width:\s*min\(100%,\s*50rem\)/);
    assert.match(css, /\.sunny-writing-empty-quick-actions/);
    assert.doesNotMatch(contentEditor, /EditorBubbleMenu/);
    assert.match(contentEditor, /BlockControlsOverlay/);
    assert.match(contentEditor, /sunny-writing-tiptap-editor/);
  });

  test("editor topbar spans full width without inspector push", () => {
    const css = readWritingCss();

    assert.match(css, /\.sunny-writing-editor-topbar[\s\S]*justify-content:\s*space-between/);
    assert.match(css, /\.sunny-writing-editor-topbar[\s\S]*width:\s*100%/);
    assert.match(css, /\.sunny-writing-editor-topbar[\s\S]*min-height:\s*3\.5rem/);
    assert.match(css, /--writing-chrome-muted/);
    assert.match(css, /\.sunny-writing-topbar-publish/);
    assert.match(css, /\.sunny-writing-topbar-more-trigger/);
    assert.doesNotMatch(css, /\.sunny-writing-editor-topbar-inner/);
    assert.doesNotMatch(
      css,
      /\.is-inspector-drawer-open[\s\S]*\.sunny-writing-editor-pane[\s\S]*padding-right:/,
    );
  });

  test("document header uses inline summary and muted quick chips", () => {
    const css = readWritingCss();
    const quickActions = read("src/components/content-editor/WritingEmptyQuickActions.tsx");
    const contentEditor = read("src/components/content-editor/ContentEditor.tsx");

    assert.match(css, /--writing-chrome-title/);
    assert.match(css, /\.sunny-writing-quick-label/);
    assert.match(css, /\.sunny-writing-quick-chip/);
    assert.match(quickActions, /常用：/);
    assert.match(contentEditor, /sunny-writing-editor-body/);
    const quickBlock = css.match(/\.sunny-writing-empty-quick-actions\s*\{[^}]+\}/)?.[0] ?? "";
    assert.doesNotMatch(quickBlock, /position:\s*absolute/);
  });

  test("editor restores list markers for markdown shortcuts", () => {
    const css = readWritingCss();

    assert.match(css, /\.sunny-rich-editor-content ul:not\(\[data-type="taskList"\]\)[\s\S]*list-style-type:\s*disc/);
    assert.match(css, /\.sunny-rich-editor-content ol[\s\S]*list-style-type:\s*decimal/);
    assert.match(css, /\.sunny-rich-editor-content ul\[data-type="taskList"\]/);
    assert.match(css, /\.sunny-writing-preview-rich ul:not\(\.sunny-rich-content-task-list\)[\s\S]*list-style-type:\s*disc/);
  });
});

describe("content editor contracts", () => {
  test("ContentEditor uses Tiptap and wires paste/drop upload", () => {
    const editor = read("src/components/content-editor/ContentEditor.tsx");
    const extensions = read("src/components/content-editor/editor-extensions.ts");

    assert.match(editor, /useEditor/);
    assert.match(editor, /buildContentEditorExtensions/);
    assert.match(editor, /SlashCommandList/);
    assert.match(extensions, /PasteImageUpload/);
  });

  test("slash commands use six groups with descriptions and AI/workflow ids", () => {
    const slash = read("src/components/content-editor/slash-commands.ts");

    for (const label of [
      "common",
      "blocks",
      "lists",
      "time",
      "ai",
      "workflow",
      "description:",
      "正文",
      "标题 1",
      "任务列表",
      "无序列表",
      "有序列表",
      "图片",
      "表格",
      "引用",
      "分割线",
      "当前日期",
      "代码块",
      "AI 续写",
      "总结本文",
      "生成大纲",
      "从本文生成清单",
      "保存为记忆",
    ]) {
      assert.match(slash, new RegExp(label));
    }
    for (const id of [
      "ai-continue",
      "ai-summarize",
      "ai-outline",
      "ai-rewrite",
      "ai-tags",
      "wf-checklist",
      "wf-plan",
      "wf-memory",
      "wf-timeline",
      "wf-plan-continue",
      "wf-schedule-weekly",
    ]) {
      assert.match(slash, new RegExp(id));
    }
  });

  test("slash popup and EditorCommandMenu use compact grouped rows", () => {
    const css = readWritingCss();
    const slashList = read("src/components/content-editor/SlashCommandList.tsx");
    const commandMenu = read("src/components/content-editor/EditorCommandMenu.tsx");

    assert.match(css, /\.sunny-rich-editor-slash-popup[\s\S]*max-height:/);
    assert.match(css, /\.sunny-rich-editor-slash-popup[\s\S]*min-width:\s*18\.75rem/);
    assert.match(css, /\.sunny-rich-editor-slash-group-label/);
    assert.match(css, /\.sunny-rich-editor-slash-icon[\s\S]*flex:\s*0\s*0\s*1\.25rem/);
    assert.match(css, /\.sunny-editor-command-description/);
    assert.match(css, /\.sunny-rich-editor-slash-empty/);
    assert.match(css, /min-height:\s*3rem/);
    assert.match(css, /html\[data-theme="dark"\][\s\S]*\.sunny-rich-editor-slash-popup/);
    assert.match(slashList, /EditorCommandMenu/);
    assert.match(slashList, /bottom-start|top-start/);
    assert.match(commandMenu, /groupSlashCommandItems/);
    assert.match(commandMenu, /没有匹配的命令/);
    assert.match(commandMenu, /sunny-editor-command-description/);
  });

  test("image upload helper posts to editor media API", () => {
    const helper = read("src/lib/editor/upload-dashboard-image.ts");

    assert.match(helper, /\/api\/editor\/upload-media/);
    assert.match(helper, /FormData/);
  });

  test("publish route accepts visibility in request body", () => {
    const route = read("src/app/api/dashboard/content/[collection]/[id]/publish/route.ts");

    assert.match(route, /visibility/);
    assert.match(route, /parsePublishBody/);
  });
});
