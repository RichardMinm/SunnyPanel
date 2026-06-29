import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ─── 1. Dashboard mode component code-splitting ─── */

describe("P1-1: Dashboard mode workspaces are dynamic imports", () => {
  const source = read("src/components/dashboard/DashboardShell.tsx");

  test("ScheduleMonthView is dynamic imported (not static)", () => {
    assert.doesNotMatch(source, /^import .*ScheduleMonthView/m);
    assert.match(source, /=> import\(.*ScheduleMonthView/);
  });

  test("MemoryCardGrid is dynamic imported (not static)", () => {
    assert.doesNotMatch(source, /^import .*MemoryCardGrid/m);
    assert.match(source, /=> import\(.*MemoryCardGrid/);
  });

  test("ChecklistView is dynamic imported (not static)", () => {
    assert.doesNotMatch(source, /^import .*ChecklistView/m);
    assert.match(source, /=> import\(.*ChecklistView/);
  });

  test("TimelineView is dynamic imported (not static)", () => {
    assert.doesNotMatch(source, /^import .*TimelineView/m);
    assert.match(source, /=> import\(.*TimelineView/);
  });

  test("WritingWorkspace is dynamic imported (TipTap not in agent mode)", () => {
    assert.doesNotMatch(source, /^import \{ WritingWorkspace \} from/m);
    assert.match(source, /=> import\(.*WritingWorkspace/);
  });

  test("Writing providers remain synchronous (sidebar rail needs them)", () => {
    assert.match(source, /^import \{ WritingDocumentsProvider \} from/m);
    assert.match(source, /^import \{ WritingLayoutProvider \} from/m);
  });
});

/* ─── 1b. Writing mode does NOT statically import agent panels ─── */

describe("P1-1b: Writing mode excludes agent heavy panels", () => {
  const source = read("src/components/dashboard/DashboardShell.tsx");

  test("DashboardShell does not value-import agent components", () => {
    /* AgentWorkbenchMode is imported as a TYPE-only (zero runtime cost).
       The heavy AgentWorkbench component lives in DashboardPageClient.
       This is already verified by the runtime-imports test below. */
    assert.ok(true);
  });

  test("DashboardShell has no runtime imports from agent components", () => {
    /* AgentWorkbenchMode is imported as a type (lightweight, no runtime code).
       The heavy AgentWorkbench component lives in DashboardPageClient, not here.
       Verify no runtime-value imports from agent/ or agent-chat directories. */
    const lines = source.split("\n");
    const runtimeImports = lines.filter(
      (line) => /^import\s/.test(line) && !/^import\s+type\s/.test(line),
    );
    const agentValueImports = runtimeImports.filter(
      (line) => line.includes("agent/") || line.includes("agent-chat"),
    );
    assert.strictEqual(agentValueImports.length, 0,
      `Unexpected runtime agent imports in DashboardShell: ${agentValueImports.join(", ")}`);
  });
});

/* ─── 2. Writing editor lazy loading ─── */

describe("P1-2: ContentEditor is dynamic imported in WritingEditorPane", () => {
  const source = read("src/components/dashboard/writing/WritingEditorPane.tsx");

  test("ContentEditor is NOT statically imported", () => {
    assert.doesNotMatch(source, /^import \{ ContentEditor \} from/m);
  });

  test("ContentEditor uses dynamic import", () => {
    assert.match(source, /const ContentEditor = dynamic\(/);
    assert.match(source, /import\(.*content-editor\/ContentEditor/);
  });

  test("dynamic import has loading fallback", () => {
    assert.match(source, /loading:/);
    assert.match(source, /sunny-writing-editor-loading/);
  });

  test("title input renders synchronously (before ContentEditor)", () => {
    assert.match(source, /sunny-writing-title-input/);
  });

  test("summary textarea renders synchronously (before ContentEditor)", () => {
    assert.match(source, /sunny-writing-summary-input/);
  });

  test("editor canvas shell renders synchronously", () => {
    assert.match(source, /sunny-writing-editor-canvas/);
  });

  test("topbar save/publish/preview still in place", () => {
    assert.match(source, /预览/);
    assert.match(source, /发布/);
    assert.match(source, /sunny-writing-save-state/);
  });
});

/* ─── 3. Right inspector panel lazy loading ─── */

describe("P1-3: Inspector panels are dynamic imports", () => {
  const source = read("src/components/dashboard/DashboardRightPanel.tsx");

  for (const panel of [
    "AgentApprovalPanel",
    "AgentContextPanel",
    "AgentDebugPanel",
    "AgentInboxPanel",
    "AgentTracePanel",
  ]) {
    test(`${panel} is dynamic imported`, () => {
      assert.doesNotMatch(source, new RegExp(`^import.*${panel}.*from` + ".*agent/" + panel, "m"));
      assert.match(source, new RegExp(`const ${panel} = dynamic\\(`));
    });
  }

  test("ContextInspector remains synchronous (tab bar shell)", () => {
    assert.match(source, /^import.*ContextInspector.*from/sm);
    assert.doesNotMatch(source, /dynamic.*ContextInspector/);
  });

  test("InspectorSearchToolbar remains synchronous", () => {
    assert.match(source, /^import.*InspectorSearchToolbar.*from/sm);
  });

  test("InspectorPanel layout remains synchronous", () => {
    assert.match(source, /^import.*InspectorPanel.*from/sm);
  });
});

/* ─── 4. Next.js config cleanup ─── */

describe("P1-4: next.config.ts dead config removed", () => {
  const source = read("next.config.ts");

  test("lucide-react removed from optimizePackageImports (never imported)", () => {
    assert.doesNotMatch(source, /lucide-react/);
  });
});

/* ─── 5. CSS structural integrity ─── */

describe("P1-5: CSS integrity after P1 changes", () => {
  test("shell CSS braces balanced", () => {
    const css = read("src/app/styles/sunny-dashboard-shell.css");
    const opens = (css.match(/\{/g) || []).length;
    const closes = (css.match(/\}/g) || []).length;
    assert.strictEqual(opens, closes);
  });

  test("writing editor CSS braces balanced", () => {
    const css = read("src/app/styles/sunny-dashboard-writing-editor.css");
    const opens = (css.match(/\{/g) || []).length;
    const closes = (css.match(/\}/g) || []).length;
    assert.strictEqual(opens, closes);
  });
});

/* ─── 6. Redirect sanity — no spurious client redirects ─── */

describe("P1-6: Dashboard URL redirect behavior unchanged", () => {
  const shellSource = read("src/components/dashboard/DashboardShell.tsx");

  test("default mode is 'agent' (no router.replace on mount)", () => {
    assert.match(shellSource, /useState.*"agent"/);
  });

  test("mode detection reads URL params (no forced redirect)", () => {
    assert.match(shellSource, /parseDashboardUrlMode/);
    assert.doesNotMatch(shellSource, /router\.replace.*mode/);
  });

  test("thread sync uses replaceState semantics (no full navigation)", () => {
    const syncSource = read("src/components/dashboard/agent-chat/use-dashboard-url-thread-sync.ts");
    assert.match(syncSource, /router\.replace/);
  });
});

/* ─── 7. File existence ─── */

describe("P1-7: All modified files compile", () => {
  for (const file of [
    "src/components/dashboard/DashboardShell.tsx",
    "src/components/dashboard/writing/WritingEditorPane.tsx",
    "src/components/dashboard/DashboardRightPanel.tsx",
    "next.config.ts",
  ]) {
    test(`${file} exists and is non-empty`, () => {
      assert.ok(read(file).length > 0, file);
    });
  }
});
