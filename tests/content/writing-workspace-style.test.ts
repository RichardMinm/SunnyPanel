import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("Dashboard Writing workspace styling", () => {
  test("global styles import the writing workspace stylesheet via dashboard bundle", () => {
    const dashboardBundle = read("src/app/styles/sunny-dashboard.css");

    assert.match(dashboardBundle, /sunny-dashboard-writing\.css/);
  });

  test("writing stylesheet defines a single-column editor surface with embedded library styles", () => {
    const css = read("src/app/styles/sunny-dashboard-writing.css");
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");

    assert.match(css, /\.sunny-writing-workspace/);
    assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    assert.doesNotMatch(css, /grid-template-columns:\s*280px/);
    assert.match(css, /\.sunny-writing-library\.is-embedded/);
    assert.match(css, /\.sunny-writing-inspector-drawer/);
    assert.match(css, /\.sunny-writing-editor-canvas/);
    assert.match(css, /\.sunny-writing-document-header/);
    assert.match(
      css,
      /\.sunny-writing-document-row\.is-active[\s\S]*border-left-color:\s*var\(--writing-active-rail/,
    );
    assert.match(shellCss, /\.sunny-dashboard-writing-library-section/);
    assert.match(
      shellCss,
      /:not\(\s*\.sunny-dashboard-writing-library-section\s*\)/,
    );
    assert.match(shellCss, /\.sunny-dashboard-icon-bar\.is-writing-mode/);
  });

  test("slash popup uses compact list row layout with group labels", () => {
    const css = read("src/app/styles/sunny-dashboard-writing.css");
    const slashList = read("src/components/content-editor/SlashCommandList.tsx");

    assert.match(css, /\.sunny-rich-editor-slash-popup[\s\S]*max-height:/);
    assert.match(css, /\.sunny-rich-editor-slash-group-label/);
    assert.match(css, /\.sunny-rich-editor-slash-icon[\s\S]*flex:\s*0\s*0\s*1\.25rem/);
    assert.match(css, /\.sunny-rich-editor-slash-label[\s\S]*flex:\s*1/);
    assert.match(css, /\.sunny-rich-editor-slash-shortcut/);
    assert.match(css, /html\[data-theme="dark"\][\s\S]*\.sunny-rich-editor-slash-popup/);
    assert.match(slashList, /sunny-rich-editor-slash-group-label/);
    assert.match(slashList, /slashCommandGroupLabels/);
  });

  test("editor topbar spans full width without inspector push", () => {
    const css = read("src/app/styles/sunny-dashboard-writing.css");
    const editorPane = read("src/components/dashboard/writing/WritingEditorPane.tsx");

    assert.match(css, /\.sunny-writing-editor-topbar[\s\S]*justify-content:\s*space-between/);
    assert.match(css, /\.sunny-writing-editor-topbar[\s\S]*width:\s*100%/);
    assert.doesNotMatch(css, /\.sunny-writing-editor-topbar-inner/);
    assert.doesNotMatch(
      css,
      /\.is-inspector-drawer-open[\s\S]*\.sunny-writing-editor-pane[\s\S]*padding-right:/,
    );
    assert.doesNotMatch(editorPane, /sunny-writing-editor-topbar-inner/);
  });

  test("writing mode sidebar keeps full workspace nav with library below", () => {
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");
    const iconBar = read("src/components/dashboard/DashboardIconBar.tsx");

    assert.doesNotMatch(
      shellCss,
      /\.sunny-dashboard-icon-bar\.is-writing-mode[\s\S]*\.sunny-dashboard-mode-row:not\(\.is-active\)[\s\S]*display:\s*none/,
    );
    assert.match(iconBar, /isWritingMode \? <WritingLibraryRail/);
    assert.match(shellCss, /\.sunny-dashboard-writing-library-section/);
  });

  test("embedded library and sidebar bottom rail match writing sidebar plan", () => {
    const css = read("src/app/styles/sunny-dashboard-writing.css");
    const shellCss = read("src/app/styles/sunny-dashboard-shell.css");
    const library = read("src/components/dashboard/writing/WritingLibrary.tsx");
    const shell = read("src/components/dashboard/DashboardShell.tsx");
    const iconBar = read("src/components/dashboard/DashboardIconBar.tsx");

    assert.match(css, /\.sunny-writing-library\.is-embedded[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/);
    assert.doesNotMatch(library, /WritingLibrarySearch/);
    assert.match(shellCss, /\.sunny-writing-sidebar-bottom-rail/);
    assert.match(iconBar, /WritingSidebarBottomRail/);
    assert.match(shell, /SIDEBAR_PINNED_STORAGE_KEY/);
    assert.match(shell, /useState\(true\)/);
    assert.match(shell, /WritingLibraryFiltersProvider/);
  });
});
