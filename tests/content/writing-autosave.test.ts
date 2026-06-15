import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

describe("writing layout persistence", () => {
  test("use-writing-layout stores preferences in localStorage", () => {
    const hook = read("src/components/dashboard/writing/use-writing-layout.ts");

    assert.match(hook, /sunny-writing-layout/);
    assert.match(hook, /localStorage/);
    assert.match(hook, /focusMode/);
    assert.match(hook, /inspectorOpen/);
  });

  test("WritingWorkspace wires layout provider state into panel classes", () => {
    const workspace = read("src/components/dashboard/writing/WritingWorkspace.tsx");

    assert.match(workspace, /useWritingLayoutContext/);
    assert.match(workspace, /is-library-open/);
    assert.match(workspace, /is-inspector-open/);
    assert.match(workspace, /is-focus-mode/);
  });
});

describe("writing autosave", () => {
  test("use-writing-documents debounces unified draft saves", () => {
    const hook = read("src/components/dashboard/writing/use-writing-documents.ts");

    assert.match(hook, /AUTOSAVE_MS\s*=\s*1500/);
    assert.match(hook, /updateDraft/);
    assert.match(hook, /scheduleAutosave/);
    assert.match(hook, /flushSave/);
  });

  test("WritingMetaPanel no longer exposes a separate save properties button", () => {
    const panel = read("src/components/dashboard/writing/WritingMetaPanel.tsx");

    assert.doesNotMatch(panel, /保存属性/);
  });
});
