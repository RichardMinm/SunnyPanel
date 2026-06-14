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

  test("DashboardShell renders WritingWorkspace", () => {
    const shell = read("src/components/dashboard/DashboardShell.tsx");

    assert.match(shell, /WritingWorkspace/);
    assert.match(shell, /activeMode === "writing"/);
  });

  test("WritingWorkspace contains library, editor, and metadata panel", () => {
    const workspace = read("src/components/dashboard/writing/WritingWorkspace.tsx");

    assert.match(workspace, /WritingLibrary/);
    assert.match(workspace, /WritingEditorPane/);
    assert.match(workspace, /WritingMetaPanel/);
  });
});
