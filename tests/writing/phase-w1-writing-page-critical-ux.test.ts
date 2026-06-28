import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ═══ 1. Bottom "常用" toolbar removed ═══ */

describe("W1-1: Bottom quick actions toolbar removed from ContentEditor", () => {
  const source = read("src/components/content-editor/ContentEditor.tsx");

  test("WritingEmptyQuickActions is not imported", () => {
    assert.doesNotMatch(source, /import.*WritingEmptyQuickActions/);
  });

  test("WritingEmptyQuickActions is not rendered", () => {
    assert.doesNotMatch(source, /<WritingEmptyQuickActions/);
  });

  test("'常用：' label no longer present in editor", () => {
    assert.doesNotMatch(source, /常用/);
  });

  test("quick chips (标题/任务列表/引用/AI 续写) no longer rendered inline", () => {
    assert.doesNotMatch(source, /sunny-writing-quick-chip/);
    assert.doesNotMatch(source, /sunny-writing-empty-quick-actions/);
  });

  test("WritingEmptyQuickActions file still exists on disk (not deleted)", () => {
    const quickSource = read("src/components/content-editor/WritingEmptyQuickActions.tsx");
    assert.ok(quickSource.length > 0, "WritingEmptyQuickActions.tsx still exists");
  });

  test("ContentEditor still imports other components", () => {
    assert.match(source, /import.*BlockControlsOverlay/);
    assert.match(source, /import.*SlashCommandList/);
    assert.match(source, /import.*FloatingFormatMenu/);
  });

  test("ContentEditor still exports ContentEditor function", () => {
    assert.match(source, /export function ContentEditor/);
  });

  test("variant='writing' branch still renders editor content", () => {
    assert.match(source, /<EditorContent editor=\{editor\}/);
  });

  test("slash menu still supported in writing variant", () => {
    assert.match(source, /slashState\.open/);
    assert.match(source, /<SlashCommandList/);
  });
});

/* ═══ 2. Body placeholder and summary placeholder ═══ */

describe("W1-2: Editor placeholder — body is primary input", () => {
  const editorCss = read("src/app/styles/sunny-dashboard-writing-editor.css");
  const inspectorCss = read("src/app/styles/sunny-dashboard-writing-inspector.css");

  test("body placeholder (ProseMirror) uses stronger color than theme default", () => {
    /* Body placeholder should use color-mix with >= 60% opacity */
    assert.match(editorCss, /\.sunny-writing-workspace \.ProseMirror p\.is-editor-empty:first-child::before\s*\{[^}]*\}/s);
    const rule = editorCss.match(/\.sunny-writing-workspace \.ProseMirror p\.is-editor-empty:first-child::before\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /color-mix/);
  });

  test("body placeholder font-size >= 1.0625rem (slightly larger)", () => {
    const rule = editorCss.match(/\.sunny-writing-workspace \.ProseMirror p\.is-editor-empty:first-child::before\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /font-size:\s*1\.0625rem/);
  });

  test("summary placeholder uses weaker color than body", () => {
    const rule = inspectorCss.match(/\.sunny-writing-summary-input::placeholder\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /color-mix/);
    /* Summary should have lower opacity (~54%) compared to body (~64%) */
  });

  test("summary placeholder font-size is 0.9375rem (slightly smaller than body)", () => {
    const rule = inspectorCss.match(/\.sunny-writing-summary-input::placeholder\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /font-size:\s*0\.9375rem/);
  });
});

/* ═══ 3. Summary and body have distinct structure ═══ */

describe("W1-3: Summary and body sections are structurally distinct", () => {
  const editorPaneSource = read("src/components/dashboard/writing/WritingEditorPane.tsx");

  test("summary row has distinct className", () => {
    assert.match(editorPaneSource, /sunny-writing-summary-row/);
  });

  test("body editor has distinct className", () => {
    assert.match(editorPaneSource, /sunny-writing-tiptap-editor/);
  });

  test("summary textarea rendered with distinct placeholder", () => {
    assert.match(editorPaneSource, /placeholder="写一句摘要/);
  });

  test("body placeholder text (from ContentEditor) is '开始写作，或输入 / 插入内容块'", () => {
    const contentEditorSource = read("src/components/content-editor/ContentEditor.tsx");
    assert.match(contentEditorSource, /开始写作，或输入 \/ 插入内容块/);
  });

  test("summary and body have different CSS classes", () => {
    assert.match(editorPaneSource, /sunny-writing-summary-input/);
    assert.match(editorPaneSource, /sunny-writing-tiptap-editor/);
    /* Verify they are different elements */
    const summaryElements = (editorPaneSource.match(/sunny-writing-summary-input/g) || []).length;
    const bodyElements = (editorPaneSource.match(/sunny-writing-tiptap-editor/g) || []).length;
    assert.ok(summaryElements > 0, "summary input class exists");
    assert.ok(bodyElements > 0, "tiptap editor class exists");
  });

  test("vertical gap between summary and body increased (margin-top >= 2.5rem)", () => {
    const editorCss = read("src/app/styles/sunny-dashboard-writing-editor.css");
    const rule = editorCss.match(/\.sunny-writing-tiptap-editor\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /margin:\s*2\.75rem/);
  });
});

/* ═══ 4. Left sidebar preserves global nav entries ═══ */

describe("W1-4: Left sidebar preserves global navigation entries", () => {
  const iconBarSource = read("src/components/dashboard/DashboardIconBar.tsx");
  const modesSource = read("src/components/dashboard/sidebar/dashboard-sidebar-modes.ts");

  test("DASHBOARD_MODES still contains 工作台 (agent)", () => {
    assert.match(modesSource, /工作台/);
    assert.match(modesSource, /"agent"/);
  });

  test("DASHBOARD_MODES still contains 日程 (schedule)", () => {
    assert.match(modesSource, /日程/);
    assert.match(modesSource, /"schedule"/);
  });

  test("DASHBOARD_MODES still contains 记忆库 (memory)", () => {
    assert.match(modesSource, /记忆库/);
    assert.match(modesSource, /"memory"/);
  });

  test("DASHBOARD_MODES still contains 写作 (writing)", () => {
    assert.match(modesSource, /写作/);
    assert.match(modesSource, /"writing"/);
  });

  test("DASHBOARD_MODES still contains 清单 (checklist)", () => {
    assert.match(modesSource, /清单/);
    assert.match(modesSource, /"checklist"/);
  });

  test("DASHBOARD_MODES still contains 时间线 (timeline)", () => {
    assert.match(modesSource, /时间线/);
    assert.match(modesSource, /"timeline"/);
  });

  test("DASHBOARD_MODES.map still renders all mode links", () => {
    assert.match(iconBarSource, /DASHBOARD_MODES\.map/);
  });

  test("写作 mode has active state via active={mode.key === activeMode}", () => {
    assert.match(iconBarSource, /active=\{mode\.key === activeMode\}/);
  });

  test("writing mode sidebar includes is-writing-mode class", () => {
    assert.match(iconBarSource, /is-writing-mode/);
  });
});

/* ═══ 5. Left sidebar hierarchy — settings, search properly placed ═══ */

describe("W1-5: Left sidebar — settings and search placement", () => {
  const bottomRailSource = read(
    "src/components/dashboard/writing/WritingSidebarBottomRail.tsx",
  );
  const shellCss = read("src/app/styles/sunny-dashboard-shell.css");

  test("bottom rail uses WritingSidebarBottomRail component", () => {
    const iconBarSource = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(iconBarSource, /WritingSidebarBottomRail/);
  });

  test("settings rendered with icon + label via SidebarItem (left-aligned)", () => {
    /* Settings trigger uses SidebarItem (triggerAsChild), not raw spans */
    assert.match(bottomRailSource, /设置/);
    assert.match(bottomRailSource, /SidebarItem/);
  });

  test("settings uses DashboardSettingsMenu", () => {
    assert.match(bottomRailSource, /<DashboardSettingsMenu/);
  });

  test("search rendered as SidebarItem", () => {
    assert.match(bottomRailSource, /label="搜索"/);
  });

  test("search opens a dialog, not inline results", () => {
    assert.match(bottomRailSource, /setSearchOpen/);
    assert.match(bottomRailSource, /WritingLibrarySearchDialog/);
  });

  test("'搜索内容' not rendered inline below settings", () => {
    /* The search results are in a dialog, not inline in the sidebar */
    assert.doesNotMatch(bottomRailSource, /搜索内容/);
  });

  test("bottom rail section '内容' has proper label", () => {
    assert.match(bottomRailSource, /title="内容"/);
  });

  test("bottom rail section '工具' has proper label", () => {
    assert.match(bottomRailSource, /title="工具"/);
  });

  test("section titles use muted small text (app-sidebar-section__title CSS)", () => {
    /* The SidebarSection component uses app-sidebar-section__title class */
    const layoutCss = read("src/app/styles/sunny-layout.css");
    assert.match(layoutCss, /\.app-sidebar-section__title/);
  });

  test("writing rail section has proper CSS for bottom rail", () => {
    assert.match(shellCss, /sunny-writing-sidebar-bottom-rail/);
    assert.match(shellCss, /sunny-writing-rail-section/);
  });
});

/* ═══ 6. Right panel collapse button semantics ═══ */

describe("W1-6: Right panel collapse button has proper semantics", () => {
  const workspaceSource = read(
    "src/components/dashboard/writing/WritingWorkspace.tsx",
  );

  test("open button has aria-label='展开属性栏'", () => {
    assert.match(workspaceSource, /aria-label="展开属性栏"/);
  });

  test("open button has tooltip via AppTooltip", () => {
    assert.match(workspaceSource, /<AppTooltip content="展开属性栏"/);
  });

  test("close button in WritingMetaPanel has aria-label", () => {
    const metaSource = read(
      "src/components/dashboard/writing/WritingMetaPanel.tsx",
    );
    assert.match(metaSource, /aria-label="收起属性栏"/);
  });

  test("close button has title attribute", () => {
    const metaSource = read(
      "src/components/dashboard/writing/WritingMetaPanel.tsx",
    );
    assert.match(metaSource, /title="收起属性栏"/);
  });

  test("open/close labels use consistent 展开/收起 pair", () => {
    assert.match(workspaceSource, /展开属性栏/);
    const metaSource = read(
      "src/components/dashboard/writing/WritingMetaPanel.tsx",
    );
    assert.match(metaSource, /收起属性栏/);
  });
});

/* ═══ 7. Top bar — save/preview/publish preserved ═══ */

describe("W1-7: Top bar save/preview/publish buttons preserved", () => {
  const editorPaneSource = read(
    "src/components/dashboard/writing/WritingEditorPane.tsx",
  );

  test("preview button still exists", () => {
    assert.match(editorPaneSource, /预览/);
    assert.match(editorPaneSource, /onTogglePreviewMode/);
  });

  test("publish button still exists as primary action", () => {
    assert.match(editorPaneSource, /发布/);
    assert.match(editorPaneSource, /variant="primary"/);
  });

  test("publish button calls openPublishDialog", () => {
    assert.match(editorPaneSource, /onClick=\{openPublishDialog\}/);
  });

  test("save state indicator still present", () => {
    assert.match(editorPaneSource, /sunny-writing-save-state/);
    assert.match(editorPaneSource, /aria-live="polite"/);
  });

  test("breadcrumb navigation still rendered", () => {
    assert.match(editorPaneSource, /sunny-writing-editor-breadcrumbs/);
    assert.match(editorPaneSource, /aria-label="文档路径"/);
  });

  test("more menu (moreHorizontal) still exists", () => {
    assert.match(editorPaneSource, /moreHorizontal/);
    assert.match(editorPaneSource, /更多操作/);
  });

  test("title input still renders", () => {
    assert.match(editorPaneSource, /aria-label="标题"/);
    assert.match(editorPaneSource, /placeholder="输入标题..."/);
  });

  test("byline still shows update time, status, visibility", () => {
    assert.match(editorPaneSource, /更新于/);
    assert.match(editorPaneSource, /sunny-writing-document-byline/);
  });

  test("WritingPublishDialog still imported and rendered", () => {
    assert.match(editorPaneSource, /import.*WritingPublishDialog/);
    assert.match(editorPaneSource, /<WritingPublishDialog/);
  });
});

/* ═══ 8. No regression — business logic unchanged ═══ */

describe("W1-8: No business logic regression", () => {
  const editorPaneSource = read(
    "src/components/dashboard/writing/WritingEditorPane.tsx",
  );

  test("flushSave still called via onFlushSave prop", () => {
    assert.match(editorPaneSource, /onFlushSave/);
  });

  test("publishDocument still called via onPublish prop", () => {
    assert.match(editorPaneSource, /onPublish/);
  });

  test("updateDraft still called via onUpdateDraft prop", () => {
    assert.match(editorPaneSource, /onUpdateDraft/);
  });

  test("saveState still passed to ContentEditor", () => {
    assert.match(editorPaneSource, /disabled=\{saveState === "saving"\}/);
  });

  test("key prop on ContentEditor still uses collection:id", () => {
    assert.match(editorPaneSource, /key=\{\`\$\{document\.collection\}:\$\{document\.id\}\`\}/);
  });
});

/* ═══ 9. CSS structural integrity ═══ */

describe("W1-9: CSS structural integrity after changes", () => {
  test("sunny-dashboard-shell.css braces balanced", () => {
    const css = read("src/app/styles/sunny-dashboard-shell.css");
    const opens = (css.match(/\{/g) || []).length;
    const closes = (css.match(/\}/g) || []).length;
    assert.strictEqual(opens, closes, `Braces must be balanced: ${opens} opens, ${closes} closes`);
  });

  test("sunny-dashboard-writing-editor.css braces balanced", () => {
    const css = read("src/app/styles/sunny-dashboard-writing-editor.css");
    const opens = (css.match(/\{/g) || []).length;
    const closes = (css.match(/\}/g) || []).length;
    assert.strictEqual(opens, closes, `Braces must be balanced: ${opens} opens, ${closes} closes`);
  });

  test("sunny-dashboard-writing-inspector.css braces balanced", () => {
    const css = read("src/app/styles/sunny-dashboard-writing-inspector.css");
    const opens = (css.match(/\{/g) || []).length;
    const closes = (css.match(/\}/g) || []).length;
    assert.strictEqual(opens, closes, `Braces must be balanced: ${opens} opens, ${closes} closes`);
  });

  test("no pseudo-element followed by selector (::after/::before without comma)", () => {
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");
    assert.doesNotMatch(shellCss, /::after\s+\.[a-zA-Z]/);
    assert.doesNotMatch(shellCss, /::before\s+\.[a-zA-Z]/);
  });

  test("no empty CSS rules in shell CSS", () => {
    const css = read("src/app/styles/sunny-dashboard-shell.css");
    const emptyRules = css.match(/[.#@][^\s{]*\s*\{\s*\}/g);
    assert.strictEqual(emptyRules, null, "No empty CSS rules should exist");
  });

  test("no { immediately followed by } (empty rules)", () => {
    const css = read("src/app/styles/sunny-dashboard-shell.css");
    assert.doesNotMatch(css, /\{\s*\}/);
  });
  test("no leading comma at start of any selector line", () => {
    const css = read("src/app/styles/sunny-dashboard-shell.css");
    assert.doesNotMatch(css, /^\s*,/m);
  });
});

/* ═══ 10. No new errors ═══ */

describe("W1-10: No new TypeScript/ESLint errors", () => {
  test("ContentEditor does not import WritingEmptyQuickActions (removed)", () => {
    const source = read("src/components/content-editor/ContentEditor.tsx");
    assert.doesNotMatch(source, /WritingEmptyQuickActions/);
  });

  test("WritingEmptyQuickActions.tsx file still valid", () => {
    const source = read("src/components/content-editor/WritingEmptyQuickActions.tsx");
    assert.ok(source.length > 0);
    assert.match(source, /export function WritingEmptyQuickActions/);
  });

  test("ContentEditor still valid TypeScript", () => {
    const source = read("src/components/content-editor/ContentEditor.tsx");
    assert.match(source, /"use client"/);
    assert.match(source, /export function ContentEditor/);
  });

  test("WritingWorkspace still valid TypeScript", () => {
    const source = read("src/components/dashboard/writing/WritingWorkspace.tsx");
    assert.match(source, /"use client"/);
    assert.match(source, /export function WritingWorkspace/);
  });

  test("WritingEditorPane still valid TypeScript", () => {
    const source = read("src/components/dashboard/writing/WritingEditorPane.tsx");
    assert.match(source, /"use client"/);
    assert.match(source, /export function WritingEditorPane/);
  });

  test("all modified files exist and have content", () => {
    const files = [
      "src/components/content-editor/ContentEditor.tsx",
      "src/components/dashboard/writing/WritingWorkspace.tsx",
      "src/components/dashboard/writing/WritingEditorPane.tsx",
      "src/components/dashboard/writing/WritingMetaPanel.tsx",
      "src/components/dashboard/writing/WritingSidebarBottomRail.tsx",
      "src/components/dashboard/DashboardIconBar.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      assert.ok(source.length > 0, `${file} should have content`);
    }
  });
});

/* ═══ 11. Writing page integration checks ═══ */

describe("W1-11: Writing page integration — key components preserved", () => {
  test("WritingWorkspace still renders WritingEditorPane", () => {
    const source = read("src/components/dashboard/writing/WritingWorkspace.tsx");
    assert.match(source, /<WritingEditorPane/);
  });

  test("WritingWorkspace still renders peek zone with toggle button", () => {
    const source = read("src/components/dashboard/writing/WritingWorkspace.tsx");
    assert.match(source, /sunny-writing-inspector-peek-zone/);
    assert.match(source, /sunny-writing-panel-toggle/);
  });

  test("DashboardShell still renders WritingWorkspace in writing mode", () => {
    const source = read("src/components/dashboard/DashboardShell.tsx");
    assert.match(source, /<WritingWorkspace/);
  });

  test("DashboardIconBar still renders WritingLibraryRail in writing mode", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(source, /<WritingLibraryRail/);
  });

  test("DashboardIconBar still renders WritingSidebarBottomRail in writing mode", () => {
    const source = read("src/components/dashboard/DashboardIconBar.tsx");
    assert.match(source, /<WritingSidebarBottomRail/);
  });

  test("ContentEditor still supports variant='writing'", () => {
    const source = read("src/components/content-editor/ContentEditor.tsx");
    assert.match(source, /variant === "writing"/);
  });
});

/* ═══ 12. Dark mode CSS preserved ═══ */

describe("W1-12: Dark mode CSS preserved after changes", () => {
  const chromeCss = read("src/app/styles/sunny-dashboard-writing-chrome.css");
  const editorCss = read("src/app/styles/sunny-dashboard-writing-editor.css");

  test("dark mode summary placeholder preserved", () => {
    assert.match(chromeCss, /html\[data-theme="dark"\] \.sunny-writing-summary-input::placeholder/);
  });

  test("dark mode body placeholder preserved", () => {
    assert.match(editorCss, /html\[data-theme="dark"\] \.sunny-writing-workspace \.ProseMirror p\.is-editor-empty:first-child::before/);
  });

  test("dark mode editor pane background preserved", () => {
    assert.match(chromeCss, /html\[data-theme="dark"\] \.sunny-writing-editor-pane/);
  });
});
