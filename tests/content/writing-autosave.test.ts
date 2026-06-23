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
    assert.match(hook, /inspectorOpen:\s*false/);
  });

  test("WritingLibraryRail wires layout libraryOpen into sidebar section classes", () => {
    const rail = read("src/components/dashboard/writing/WritingLibraryRail.tsx");

    assert.match(rail, /useWritingLayoutContext/);
    assert.match(rail, /layout\.libraryOpen/);
    assert.match(rail, /is-collapsed/);
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

  test("WritingDocumentsProvider stores shared document actions", () => {
    const provider = read("src/components/dashboard/writing/WritingDocumentsContext.tsx");

    assert.match(provider, /useWritingDocuments/);
    assert.match(provider, /handleSelectDocument/);
    assert.match(provider, /handleDeleteRequest/);
  });

  test("WritingMetaPanel no longer exposes a separate save properties button", () => {
    const panel = read("src/components/dashboard/writing/WritingMetaPanel.tsx");

    assert.doesNotMatch(panel, /保存属性/);
  });
});
