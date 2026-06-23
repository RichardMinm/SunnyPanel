import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("Dashboard Writing workspace", () => {
  test("sidebar exposes Writing workspace", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");

    assert.match(sidebar, /key: "writing"/);
    assert.match(sidebar, /label: "写作"/);
  });

  test("DashboardShell wraps writing mode with document and layout providers", () => {
    const shell = read("src/components/dashboard/DashboardShell.tsx");

    assert.match(shell, /WritingWorkspace/);
    assert.match(shell, /WritingDocumentsProvider/);
    assert.match(shell, /WritingLayoutProvider/);
    assert.match(shell, /threadListMode="hidden"/);
    assert.match(shell, /writingMode=\{activeMode === "writing"\}/);
  });

  test("WritingWorkspace is editor-only and uses shared document context", () => {
    const workspace = read("src/components/dashboard/writing/WritingWorkspace.tsx");

    assert.match(workspace, /useWritingDocumentsContext/);
    assert.match(workspace, /WritingEditorPane/);
    assert.match(workspace, /WritingMetaPanel/);
    assert.doesNotMatch(workspace, /WritingLibrary/);
  });

  test("Dashboard sidebar embeds writing library rail below workspace modes", () => {
    const sidebar = read("src/components/dashboard/DashboardIconBar.tsx");

    assert.match(sidebar, /WritingLibraryRail/);
  });
});
