import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ═══ 1. WritingLibraryRail with header-visible collapse ═══ */

describe("W1A-1: WritingLibraryRail header-visible collapse (no toggle, no switch)", () => {
  const source = read("src/components/dashboard/writing/WritingLibraryRail.tsx");

  test("no longer imports SidebarCollapseToggle", () => {
    assert.doesNotMatch(source, /SidebarCollapseToggle/);
  });

  test("no collapsed bar element", () => {
    assert.doesNotMatch(source, /sunny-writing-library-collapsed-bar/);
  });

  test("no expandable wrapper", () => {
    assert.doesNotMatch(source, /sunny-writing-library-expandable/);
  });

  test("always renders WritingLibrary directly", () => {
    assert.match(source, /<WritingLibrary/);
    assert.match(source, /variant="embedded"/);
  });

  test("passes libraryOpen prop to WritingLibrary", () => {
    assert.match(source, /libraryOpen=\{open\}/);
  });

  test("passes onToggle prop to WritingLibrary", () => {
    assert.match(source, /onToggle=\{\(\) => setLibraryOpen/);
  });

  test("section aria-label='文档集'", () => {
    assert.match(source, /aria-label="文档集"/);
  });

  test("section uses is-collapsed class based on open state", () => {
    assert.match(source, /is-collapsed/);
  });

  test("focus mode returns null", () => {
    assert.match(source, /layout\.focusMode/);
    assert.match(source, /return null/);
  });
});

/* ═══ 2. WritingLibrary accepts and passes libraryOpen / onToggle ═══ */

describe("W1A-2: WritingLibrary + WritingLibraryHeader handle open/close", () => {
  const libSource = read("src/components/dashboard/writing/WritingLibrary.tsx");
  const headerSource = read("src/components/dashboard/writing/WritingLibraryHeader.tsx");

  test("WritingLibrary accepts libraryOpen prop", () => {
    assert.match(libSource, /libraryOpen/);
  });

  test("WritingLibrary passes libraryOpen to WritingLibraryHeader", () => {
    assert.match(libSource, /libraryOpen=\{libraryOpen\}/);
  });

  test("WritingLibraryHeader shows chevronLeft when open", () => {
    assert.match(headerSource, /"chevronLeft"/);
  });

  test("WritingLibraryHeader shows chevronRight when collapsed", () => {
    assert.match(headerSource, /"chevronRight"/);
  });

  test("WritingLibraryHeader toggles aria-label based on state", () => {
    assert.match(headerSource, /"收起文档集"/);
    assert.match(headerSource, /"展开文档集"/);
  });

  test("WritingLibraryHeader toggles tooltip based on state", () => {
    assert.match(headerSource, /收起文档集/);
    assert.match(headerSource, /展开文档集/);
  });

  test("header uses role='button' when collapsed (clickable)", () => {
    assert.match(headerSource, /role=\{libraryOpen \? undefined : "button"\}/);
  });
});

/* ═══ 3. Bottom quick actions toolbar removed ═══ */

describe("W1A-3: Bottom quick actions toolbar removed", () => {
  const source = read("src/components/content-editor/ContentEditor.tsx");

  test("WritingEmptyQuickActions not imported", () => {
    assert.doesNotMatch(source, /WritingEmptyQuickActions/);
  });

  test("'常用' label not present", () => {
    assert.doesNotMatch(source, /常用/);
  });

  test("quick chip classes not present", () => {
    assert.doesNotMatch(source, /sunny-writing-quick-chip/);
    assert.doesNotMatch(source, /sunny-writing-empty-quick-actions/);
  });
});

/* ═══ 4. Editor focus ═══ */

describe("W1A-4: Editor focus — body primary, summary secondary", () => {
  const editorCss = read("src/app/styles/sunny-dashboard-writing-editor.css");
  const inspectorCss = read("src/app/styles/sunny-dashboard-writing-inspector.css");

  test("body placeholder uses color-mix", () => {
    const rule = editorCss.match(
      /\.sunny-writing-workspace \.ProseMirror p\.is-editor-empty:first-child::before\s*\{[^}]*\}/s,
    );
    assert.ok(rule);
    assert.match(rule![0], /color-mix\(in oklch/);
  });

  test("body placeholder font-size >= 1.0625rem", () => {
    const rule = editorCss.match(
      /\.sunny-writing-workspace \.ProseMirror p\.is-editor-empty:first-child::before\s*\{[^}]*\}/s,
    );
    assert.ok(rule);
    assert.match(rule![0], /font-size:\s*1\.0625rem/);
  });

  test("summary placeholder weaker color", () => {
    const rule = inspectorCss.match(
      /\.sunny-writing-summary-input::placeholder\s*\{[^}]*\}/s,
    );
    assert.ok(rule);
    assert.match(rule![0], /color-mix/);
  });

  test("vertical gap between summary and body >= 2.5rem", () => {
    const rule = editorCss.match(/\.sunny-writing-tiptap-editor\s*\{[^}]*\}/s);
    assert.ok(rule);
    assert.match(rule![0], /margin:\s*2\.75rem/);
  });
});

/* ═══ 5. Settings entry uses SidebarItem + triggerAsChild ═══ */

describe("W1A-5: Settings entry uses SidebarItem + triggerAsChild", () => {
  const source = read("src/components/dashboard/writing/WritingSidebarBottomRail.tsx");

  test("DashboardSettingsMenu uses triggerAsChild", () => {
    assert.match(source, /triggerAsChild/);
  });

  test("trigger is SidebarItem inside DashboardSettingsMenu", () => {
    assert.match(source, /trigger=\{\s*\n\s*<SidebarItem/);
  });

  test("SidebarItem label is '设置'", () => {
    assert.match(source, /label="设置"/);
  });

  test("SidebarItem tooltip is '设置'", () => {
    assert.match(source, /tooltip="设置"/);
  });

  test("SidebarItem icon uses settings", () => {
    assert.match(source, /DashboardIcon name="settings"/);
  });

  test("old className preserved", () => {
    assert.match(source, /sunny-dashboard-sidebar-action/);
    assert.match(source, /sunny-dashboard-sidebar-settings-trigger/);
  });
});

/* ═══ 6. Global nav entries preserved ═══ */

describe("W1A-6: Global main nav entries preserved in writing mode", () => {
  const modesSource = read("src/components/dashboard/sidebar/dashboard-sidebar-modes.ts");

  test("6 main nav modes defined", () => {
    const keyMatches = modesSource.match(/key:\s*"(agent|schedule|memory|writing|checklist|timeline)"/g);
    assert.strictEqual(keyMatches?.length, 6);
  });

  for (const label of ["工作台", "日程", "记忆库", "写作", "清单", "时间线"]) {
    test(`nav includes ${label}`, () => {
      assert.match(modesSource, new RegExp(label));
    });
  }
});

/* ═══ 7. Agent entries hidden in writing mode ═══ */

describe("W1A-7: Agent entries hidden in writing mode", () => {
  const source = read("src/components/dashboard/DashboardIconBar.tsx");

  test("新对话 inside !isWritingMode guard", () => {
    const notWriting = source.match(/!isWritingMode \? \(\s*<>[\s\S]*?<\/>\s*\)/);
    assert.ok(notWriting);
    assert.match(notWriting![0], /新对话/);
  });

  test("search input inside !isWritingMode guard", () => {
    const notWriting = source.match(/!isWritingMode \? \(\s*<>[\s\S]*?<\/>\s*\)/);
    assert.ok(notWriting);
    assert.match(notWriting![0], /AppSearchInput/);
  });

  test("session sidebar only for agent mode", () => {
    assert.match(source, /showSessionSidebar = activeMode === "agent"/);
  });
});

/* ═══ 8. Publish/preview preserved ═══ */

describe("W1A-8: Save/preview/publish buttons preserved", () => {
  const source = read("src/components/dashboard/writing/WritingEditorPane.tsx");

  test("preview button exists", () => {
    assert.match(source, /预览/);
  });

  test("publish button exists", () => {
    assert.match(source, /发布/);
    assert.match(source, /variant="primary"/);
  });

  test("save state indicator exists", () => {
    assert.match(source, /sunny-writing-save-state/);
  });
});

/* ═══ 9. CSS structural integrity ═══ */

describe("W1A-9: CSS structural integrity", () => {
  test("shell CSS braces balanced", () => {
    const css = read("src/app/styles/sunny-dashboard-shell.css");
    const opens = (css.match(/\{/g) || []).length;
    const closes = (css.match(/\}/g) || []).length;
    assert.strictEqual(opens, closes);
  });

  test("no leading comma in shell CSS", () => {
    const css = read("src/app/styles/sunny-dashboard-shell.css");
    assert.doesNotMatch(css, /^\s*,/m);
  });

  test("no leading comma after CSS comment", () => {
    const css = read("src/app/styles/sunny-dashboard-shell.css");
    assert.doesNotMatch(css, /\*\/\s*,/);
  });

  test("SidebarSection renders aria-label (BUGFIX)", () => {
    const sectionSource = read("src/components/layout/SidebarSection.tsx");
    assert.match(sectionSource, /"aria-label"/);
    assert.match(sectionSource, /aria-label=\{ariaLabel\}/);
  });
});

/* ═══ 10. No new errors ═══ */

describe("W1A-10: No new TypeScript/ESLint errors", () => {
  test("all modified files have content", () => {
    for (const file of [
      "src/components/dashboard/writing/WritingLibraryRail.tsx",
      "src/components/dashboard/writing/WritingLibrary.tsx",
      "src/components/dashboard/writing/WritingLibraryHeader.tsx",
      "src/components/dashboard/writing/WritingSidebarBottomRail.tsx",
    ]) {
      assert.ok(read(file).length > 0, file);
    }
  });

  test("WritingLibraryRail exports function", () => {
    const source = read("src/components/dashboard/writing/WritingLibraryRail.tsx");
    assert.match(source, /export function WritingLibraryRail/);
  });
});
