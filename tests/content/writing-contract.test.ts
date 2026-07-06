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

const missingBoundaries = (source: string, markers: string[]) =>
  markers.filter((marker) => !source.includes(marker));

const uniqueMatches = (source: string, pattern: RegExp) =>
  [...new Set([...source.matchAll(pattern)].map((match) => match[1]!).filter(Boolean))].sort();

describe("Dashboard Writing workspace contracts", () => {
  test("architecture guard: dashboard exposes writing mode through the sidebar and provider shell", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");
    const sidebarModes = read("src/components/dashboard/sidebar/dashboard-sidebar-modes.ts");
    const shell = read("src/components/dashboard/DashboardShell.tsx");
    const workspace = read("src/components/dashboard/writing/WritingWorkspace.tsx");

    const contract = {
      modeEntry: missingBoundaries(sidebarModes, ['key: "writing"', 'label: "写作"']),
      providerShell: missingBoundaries(shell, [
        "WritingLayoutProvider",
        "WritingDocumentsProvider",
        "WritingLibraryFiltersProvider",
        'threadListMode="hidden"',
        'writingMode={activeMode === "writing"}',
      ]),
      sidebarRail: missingBoundaries(sidebar, ["WritingLibraryRail", "isWritingMode ? <WritingLibraryRail"]),
      workspaceBoundary: {
        missing: missingBoundaries(workspace, [
          "useWritingDocumentsContext",
          "WritingEditorPane",
          "WritingMetaPanel",
        ]),
        ownsLibraryPanel: workspace.includes("WritingLibrary"),
      },
    };

    assert.deepEqual(contract, {
      modeEntry: [],
      providerShell: [],
      sidebarRail: [],
      workspaceBoundary: {
        missing: [],
        ownsLibraryPanel: false,
      },
    });
  });

  test("writing inspector keeps the stable metadata sections without a manual save action", () => {
    const meta = read("src/components/dashboard/writing/WritingMetaPanel.tsx");
    const visibleSections = ["基本信息", "发布设置", "标签", "版本历史", "关联", "高级设置"].filter((label) =>
      meta.includes(label),
    );

    assert.deepEqual(visibleSections, ["基本信息", "发布设置", "标签", "版本历史", "关联", "高级设置"]);
    assert.equal(meta.includes("保存属性"), false);
  });

  test("writing library rail exposes stable user actions and empty states", () => {
    const library = read("src/components/dashboard/writing/WritingLibrary.tsx");
    const header = read("src/components/dashboard/writing/WritingLibraryHeader.tsx");
    const bottomRail = read("src/components/dashboard/writing/WritingSidebarBottomRail.tsx");
    const emptyState = read("src/components/dashboard/writing/WritingEmptyState.tsx");
    const categoryGroup = read("src/components/dashboard/writing/WritingCategoryGroup.tsx");
    const visibleText = [header, bottomRail, emptyState, categoryGroup].join("\n");

    for (const text of [
      "文档集",
      "新建文档集",
      "草稿",
      "归档",
      "搜索",
      "内容",
      "工具",
      "暂无文档集",
      "点击新建文档集开始整理内容",
      "暂无文档",
    ]) {
      assert.ok(visibleText.includes(text), `writing library should expose "${text}"`);
    }

    assert.deepEqual(
      {
        libraryComposition: missingBoundaries(library, [
          "WritingCategoryGroup",
          "WritingUncategorizedGroup",
          "useWritingLibraryFiltersContext",
        ]),
        railComposition: missingBoundaries(bottomRail, [
          "SidebarSection",
          "WritingLibrarySearchDialog",
          "DashboardSettingsMenu",
        ]),
        legacySearchInLibrary: library.includes("WritingLibrarySearch"),
        legacyFooterInLibrary: library.includes("WritingLibraryFooter"),
      },
      {
        libraryComposition: [],
        railComposition: [],
        legacySearchInLibrary: false,
        legacyFooterInLibrary: false,
      },
    );
  });

  test("writing editor chrome exposes inline summary and topbar actions without old trigger copy", () => {
    const editorPane = read("src/components/dashboard/writing/WritingEditorPane.tsx");
    const visibleText = [
      "写一句摘要，帮助自己快速理解这篇内容",
      "未命名内容",
      "草稿",
      "内容",
    ].filter((text) => editorPane.includes(text));

    assert.deepEqual(visibleText, ["写一句摘要，帮助自己快速理解这篇内容", "未命名内容", "草稿", "内容"]);
    assert.deepEqual(missingBoundaries(editorPane, ["showsSummaryField", "moreHorizontal"]), []);
    assert.equal(editorPane.includes('trigger="新建文档"'), false);
    assert.equal(editorPane.includes('trigger="更多"'), false);
  });
});

describe("Dashboard Writing styling contracts", () => {
  test("architecture guard: dashboard bundle imports the writing style modules", () => {
    const dashboardBundle = read("src/app/styles/sunny-dashboard.css");
    const writingBundle = read("src/app/styles/sunny-dashboard-writing.css");

    assert.deepEqual(
      {
        dashboardImports: missingBoundaries(dashboardBundle, ["sunny-dashboard-writing.css"]),
        writingImports: missingBoundaries(writingBundle, [
          "sunny-dashboard-writing-layout.css",
          "sunny-dashboard-writing-library.css",
          "sunny-dashboard-writing-editor.css",
          "sunny-dashboard-writing-chrome.css",
          "sunny-dashboard-writing-inspector.css",
          "sunny-dashboard-writing-misc.css",
        ]),
      },
      {
        dashboardImports: [],
        writingImports: [],
      },
    );
  });

  test("architecture guard: writing styles keep editor-only layout and stable CSS tokens", () => {
    const css = readWritingCss();
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");

    assert.deepEqual(
      {
        writingCss: missingBoundaries(css, [
          ".sunny-writing-workspace",
          "grid-template-columns: minmax(0, 1fr)",
          ".sunny-writing-library.is-embedded",
          ".sunny-writing-inspector-drawer",
          "--writing-chrome-muted",
          "--writing-chrome-title",
          "--writing-tree-indent",
          "--writing-category-tint-accent",
        ]),
        shellCss: missingBoundaries(shellCss, [".sunny-dashboard-icon-bar.is-writing-mode"]),
      },
      {
        writingCss: [],
        shellCss: [],
      },
    );
    assert.equal(css.includes("grid-template-columns: 280px"), false);
  });

  test("writing editor CSS keeps readable canvas and markdown shortcut list markers", () => {
    const css = readWritingCss();

    assert.ok(css.includes("width: min(100%, 48rem)"), "editor canvas should keep a readable measure");
    assert.ok(css.includes("width: min(100%, 50rem)"), "preview canvas should keep a readable measure");
    assert.match(css, /\.sunny-rich-editor-content ul:not\(\[data-type="taskList"\]\)[\s\S]*list-style-type:\s*disc/);
    assert.match(css, /\.sunny-rich-editor-content ol[\s\S]*list-style-type:\s*decimal/);
    assert.match(css, /\.sunny-writing-preview-rich ul:not\(\.sunny-rich-content-task-list\)[\s\S]*list-style-type:\s*disc/);
    assert.equal(css.includes(".sunny-writing-editor-topbar-inner"), false);
    assert.equal(
      /\.is-inspector-drawer-open[\s\S]*\.sunny-writing-editor-pane[\s\S]*padding-right:/.test(css),
      false,
    );
  });

  test("architecture guard: slash command UI keeps grouped popup and dark-mode support", () => {
    const css = readWritingCss();
    const slashList = read("src/components/content-editor/SlashCommandList.tsx");
    const commandMenu = read("src/components/content-editor/EditorCommandMenu.tsx");

    assert.deepEqual(
      {
        css: missingBoundaries(css, [
          ".sunny-rich-editor-slash-popup",
          ".sunny-rich-editor-slash-group-label",
          ".sunny-editor-command-description",
          'html[data-theme="dark"] .sunny-rich-editor-slash-popup',
        ]),
        components: missingBoundaries(`${slashList}\n${commandMenu}`, [
          "EditorCommandMenu",
          "groupSlashCommandItems",
          "没有匹配的命令",
        ]),
      },
      {
        css: [],
        components: [],
      },
    );
  });
});

describe("content editor contracts", () => {
  test("architecture guard: ContentEditor uses Tiptap, slash commands, block controls, and upload extensions", () => {
    const editor = read("src/components/content-editor/ContentEditor.tsx");
    const extensions = read("src/components/content-editor/editor-extensions.ts");

    assert.deepEqual(
      {
        editor: missingBoundaries(editor, [
          "useEditor",
          "buildContentEditorExtensions",
          "SlashCommandList",
          "BlockControlsOverlay",
          "sunny-writing-tiptap-editor",
          "sunny-writing-editor-body",
        ]),
        extensions: missingBoundaries(extensions, ["PasteImageUpload"]),
        legacyBubbleMenuMounted: editor.includes("EditorBubbleMenu"),
      },
      {
        editor: [],
        extensions: [],
        legacyBubbleMenuMounted: false,
      },
    );
  });

  test("slash commands expose stable block, AI, and workflow command matrix", () => {
    const slash = read("src/components/content-editor/slash-commands.ts");
    const groups = uniqueMatches(slash, /group:\s*"([^"]+)"/g);
    const labels = new Set(uniqueMatches(slash, /label:\s*"([^"]+)"/g));
    const ids = new Set(uniqueMatches(slash, /id:\s*"([^"]+)"/g));

    assert.deepEqual(groups, ["ai", "blocks", "common", "lists", "time", "workflow"]);
    assert.deepEqual(
      ["正文", "标题 1", "任务列表", "无序列表", "有序列表", "图片", "表格", "引用", "当前日期", "代码块"].filter(
        (label) => !labels.has(label),
      ),
      [],
    );
    assert.deepEqual(
      [
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
      ].filter((id) => !ids.has(id)),
      [],
    );
    assert.ok(slash.includes("description:"), "slash commands should keep command descriptions");
  });

  test("architecture guard: editor upload and publish helpers keep stable request boundaries", () => {
    const helper = read("src/lib/editor/upload-dashboard-image.ts");
    const route = read("src/app/api/dashboard/content/[collection]/[id]/publish/route.ts");

    assert.deepEqual(
      {
        upload: missingBoundaries(helper, ["/api/editor/upload-media", "FormData"]),
        publish: missingBoundaries(route, ["visibility", "parsePublishBody"]),
      },
      {
        upload: [],
        publish: [],
      },
    );
  });
});
