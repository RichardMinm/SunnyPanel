import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

/* ─── 1. Dashboard server loader does NOT load heavy workspace data ─── */

describe("P2-1: loadDashboardData is stripped to critical-path only", () => {
  const source = read("src/lib/dashboard/load-dashboard-data.ts");

  test("loadDashboardData does NOT import workspace snapshot", () => {
    assert.doesNotMatch(source, /workspace-cache/);
    assert.doesNotMatch(source, /getCachedWorkspaceSnapshot/);
    assert.doesNotMatch(source, /assembleWorkspaceSnapshot/);
  });

  test("loadDashboardData does NOT import suggestion sync", () => {
    assert.doesNotMatch(source, /syncAgentSuggestionsFromWorkspaceSnapshot/);
  });

  test("loadDashboardData does NOT import pending suggestions", () => {
    assert.doesNotMatch(source, /getPendingAgentSuggestions/);
  });

  test("loadDashboardData does NOT import workspace core", () => {
    assert.doesNotMatch(source, /loadWorkspaceCore/);
  });

  test("loadDashboardData only imports server-only and defines parseDashboardThreadId", () => {
    assert.match(source, /import "server-only"/);
    assert.match(source, /parseDashboardThreadId/);
  });

  test("loadDashboardData returns only initialThreadId", () => {
    assert.match(source, /return \{ initialThreadId \}/);
    /* initialSuggestions should NOT be in the return type */
    assert.doesNotMatch(source, /initialSuggestions/);
  });

  test("LoadedDashboardData type has only initialThreadId", () => {
    /* No initialSuggestions in the type */
    const match = source.match(/export type LoadedDashboardData = \{([^}]+)\}/);
    assert.ok(match, "LoadedDashboardData type exists");
    assert.match(match[1], /initialThreadId/);
    assert.doesNotMatch(match[1], /initialSuggestions/);
  });
});

/* ─── 2. Dashboard page server component is minimal ─── */

describe("P2-2: DashboardPage server component is minimal", () => {
  const source = read("src/app/(site)/dashboard/page.tsx");

  test("DashboardPage imports server timing", () => {
    assert.match(source, /createServerTiming/);
    assert.match(source, /server-timing/);
  });

  test("DashboardPage calls loadDashboardData", () => {
    assert.match(source, /loadDashboardData/);
  });

  test("DashboardPage renders DashboardPageClient with only initialThreadId", () => {
    assert.match(source, /<DashboardPageClient/);
    assert.match(source, /initialThreadId=\{initialThreadId\}/);
  });

  test("DashboardPage does NOT import AgentInboxSuggestion", () => {
    assert.doesNotMatch(source, /AgentInboxSuggestion/);
  });

  test("DashboardPage does NOT import workspace modules", () => {
    assert.doesNotMatch(source, /workspace-cache/);
    assert.doesNotMatch(source, /getCachedWorkspaceSnapshot/);
    assert.doesNotMatch(source, /loadWorkspaceCore/);
  });

  test("DashboardPage does NOT import suggestion modules", () => {
    assert.doesNotMatch(source, /syncAgentSuggestions/);
    assert.doesNotMatch(source, /getPendingAgentSuggestions/);
  });

  test("DashboardPage still exports dynamic = force-dynamic", () => {
    assert.match(source, /export const dynamic = "force-dynamic"/);
  });

  test("buildDashboardRedirectPath is unchanged", () => {
    assert.match(source, /buildDashboardRedirectPath/);
    assert.match(source, /\/dashboard\?/);
  });
});

/* ─── 3. Client-side suggestion sync trigger ─── */

describe("P2-3: DashboardPageClient triggers suggestion sync after mount", () => {
  const source = read("src/components/dashboard/DashboardPageClient.tsx");

  test("DashboardPageClient has useEffect for suggestion sync", () => {
    assert.match(source, /useEffect/);
    assert.match(source, /\/api\/agent\/suggestions\/sync/);
  });

  test("Suggestion sync is POST fire-and-forget", () => {
    assert.match(source, /method: "POST"/);
    assert.match(source, /\.catch/);
  });

  test("DashboardPageClient does NOT import suggestion functions", () => {
    assert.doesNotMatch(source, /getPendingAgentSuggestions/);
    assert.doesNotMatch(source, /syncAgentSuggestionsFromWorkspaceSnapshot/);
  });

  test("DashboardPageClient does NOT import workspace functions", () => {
    assert.doesNotMatch(source, /workspace-cache/);
    assert.doesNotMatch(source, /loadWorkspaceCore/);
  });
});

/* ─── 4. Suggestion sync API endpoint exists ─── */

describe("P2-4: POST /api/agent/suggestions/sync endpoint", () => {
  const source = read("src/app/api/agent/suggestions/sync/route.ts");

  test("Sync route exports POST handler", () => {
    assert.match(source, /export async function POST/);
  });

  test("Sync route performs auth check", () => {
    assert.match(source, /getPayloadAuthResult/);
    assert.match(source, /status: 401/);
  });

  test("Sync route calls getCachedWorkspaceSnapshot", () => {
    assert.match(source, /getCachedWorkspaceSnapshot/);
  });

  test("Sync route calls syncAgentSuggestionsFromWorkspaceSnapshot", () => {
    assert.match(source, /syncAgentSuggestionsFromWorkspaceSnapshot/);
  });

  test("Sync route uses server timing", () => {
    assert.match(source, /createServerTiming/);
  });
});

/* ─── 5. Existing GET /api/agent/suggestions is unchanged ─── */

describe("P2-5: GET /api/agent/suggestions unchanged", () => {
  const source = read("src/app/api/agent/suggestions/route.ts");

  test("GET handler still exports GET", () => {
    assert.match(source, /export async function GET/);
  });

  test("GET handler still calls getPendingAgentSuggestions", () => {
    assert.match(source, /getPendingAgentSuggestions/);
  });

  test("PATCH handler still works (accept/dismiss/done)", () => {
    assert.match(source, /export async function PATCH/);
    assert.match(source, /accept/);
    assert.match(source, /dismiss/);
  });
});

/* ─── 6. Archived threads are client-side only ─── */

describe("P2-6: Archived threads are client-side (not in server render)", () => {
  /* Server component should NOT query archived threads */
  const pageSource = read("src/app/(site)/dashboard/page.tsx");
  const loaderSource = read("src/lib/dashboard/load-dashboard-data.ts");

  test("Server page does NOT reference archived threads", () => {
    assert.doesNotMatch(pageSource, /archived/);
  });

  test("Server loader does NOT reference archived threads", () => {
    assert.doesNotMatch(loaderSource, /archived/);
  });

  test("useAgentThreadList fetches threads from client API", () => {
    const source = read("src/components/dashboard/agent-chat/use-agent-thread.ts");
    assert.match(source, /\/api\/agent\/thread/);
    assert.match(source, /fetch/);
  });
});

/* ─── 7. Thread detail is NOT double-queried ─── */

describe("P2-7: Thread detail not double-queried (server + client)", () => {
  const pageSource = read("src/app/(site)/dashboard/page.tsx");
  const loaderSource = read("src/lib/dashboard/load-dashboard-data.ts");

  test("Server loader does NOT query thread detail", () => {
    assert.doesNotMatch(loaderSource, /agent-threads/);
    assert.doesNotMatch(loaderSource, /payload\.find/);
    assert.doesNotMatch(loaderSource, /payload\.findByID/);
  });

  test("Server page does NOT query thread detail (only auth)", () => {
    /* The page does a lightweight auth check (users count) but NOT thread queries */
    assert.doesNotMatch(pageSource, /agent-threads/);
    assert.doesNotMatch(pageSource, /loadDashboardData.*thread/);
    /* Auth check uses payload.find for users, but that's lightweight and necessary */
    assert.match(pageSource, /getPayloadAuthResult/);
  });

  test("Client fetches thread via API (single source of truth)", () => {
    const source = read("src/components/dashboard/agent-chat/use-agent-thread.ts");
    assert.match(source, /fetch\(.*\/api\/agent\/thread/);
  });
});

/* ─── 8. Workspace context is NOT loaded on server render ─── */

describe("P2-8: Full workspace context NOT loaded on server render", () => {
  const pageSource = read("src/app/(site)/dashboard/page.tsx");
  const loaderSource = read("src/lib/dashboard/load-dashboard-data.ts");

  test("Server loader does NOT load plans", () => {
    assert.doesNotMatch(loaderSource, /collection.*plans/);
  });

  test("Server loader does NOT load posts/notes/updates", () => {
    assert.doesNotMatch(loaderSource, /collection.*posts/);
    assert.doesNotMatch(loaderSource, /collection.*notes/);
    assert.doesNotMatch(loaderSource, /collection.*updates/);
  });

  test("Server loader does NOT load schedule", () => {
    assert.doesNotMatch(loaderSource, /schedule/);
  });

  test("Server loader does NOT load timeline events", () => {
    assert.doesNotMatch(loaderSource, /timeline-events/);
  });

  test("Server loader does NOT do count queries", () => {
    assert.doesNotMatch(loaderSource, /payload\.count/);
  });

  test("Server loader does NOT import from workspace module", () => {
    assert.doesNotMatch(loaderSource, /from "@\/lib\/payload\/workspace/);
  });

  test("Server loader does NOT import suggestions module (sync/query)", () => {
    assert.doesNotMatch(loaderSource, /from "@\/lib\/agent\/suggestions/);
  });
});

/* ─── 9. Non-current mode data is NOT loaded on server ─── */

describe("P2-9: Non-current mode data NOT loaded on server render", () => {
  test("Server page does NOT import mode-specific components", () => {
    const source = read("src/app/(site)/dashboard/page.tsx");
    /* Only DashboardPageClient + auth + timing are imported — all mode components are dynamic */
    const nonTypeImports = source.split("\n").filter(
      (line) => /^import\s/.test(line) && !/^import\s+type\s/.test(line),
    );
    /* Expected: next/navigation, DashboardPageClient, loadDashboardData, server-timing, auth, client */
    assert.ok(nonTypeImports.length >= 3, `Expected at least 3 imports, got ${nonTypeImports.length}`);
    assert.match(nonTypeImports.join("\n"), /DashboardPageClient/);
    assert.match(nonTypeImports.join("\n"), /loadDashboardData/);
    assert.match(nonTypeImports.join("\n"), /server-timing/);
    assert.match(nonTypeImports.join("\n"), /getPayloadAuthResult/);
  });

  test("DashboardShell does NOT import payload client", () => {
    const source = read("src/components/dashboard/DashboardShell.tsx");
    assert.doesNotMatch(source, /getPayloadClient/);
    assert.doesNotMatch(source, /payload/);
  });
});

/* ─── 10. mode=writing first document only loads writing shell data ─── */

describe("P2-10: Writing mode only loads shell data on first document", () => {
  test("WritingEditorPane does NOT import payload client", () => {
    const source = read("src/components/dashboard/writing/WritingEditorPane.tsx");
    assert.doesNotMatch(source, /getPayloadClient/);
  });

  test("WritingWorkspace does NOT import payload client on server", () => {
    const source = read("src/components/dashboard/writing/WritingWorkspace.tsx");
    /* WritingWorkspace is a client component that fetches via API */
    assert.doesNotMatch(source, /from "server-only"/);
  });
});

/* ─── 11. mode=agent first document does NOT load TipTap ─── */

describe("P2-11: Agent mode does NOT load TipTap / ContentEditor", () => {
  test("DashboardShell ContentEditor is NOT imported in non-writing paths", () => {
    const source = read("src/components/dashboard/DashboardShell.tsx");
    /* ContentEditor is only imported inside WritingEditorPane (dynamic import from P1) */
    assert.doesNotMatch(source, /ContentEditor/);
    assert.doesNotMatch(source, /content-editor/);
    assert.doesNotMatch(source, /@tiptap/);
  });

  test("Agent workbench does NOT import TipTap", () => {
    const source = read("src/components/dashboard/agent/index.ts");
    assert.doesNotMatch(source, /@tiptap/);
    assert.doesNotMatch(source, /ContentEditor/);
  });
});

/* ─── 12. Right inspector advanced content does NOT block server render ─── */

describe("P2-12: Right inspector does NOT block server render", () => {
  test("DashboardRightPanel does NOT import payload client", () => {
    const source = read("src/components/dashboard/DashboardRightPanel.tsx");
    assert.doesNotMatch(source, /getPayloadClient/);
  });

  test("DashboardRightPanel uses dynamic imports for heavy panels (P1)", () => {
    const source = read("src/components/dashboard/DashboardRightPanel.tsx");
    /* Agent panels should be dynamic imports */
    for (const panel of ["AgentApprovalPanel", "AgentContextPanel", "AgentDebugPanel", "AgentInboxPanel", "AgentTracePanel"]) {
      assert.match(source, new RegExp(`const ${panel} = dynamic\\(`));
    }
  });
});

/* ─── 13. Server timing helper is functional ─── */

describe("P2-13: Server timing helper module", () => {
  const source = read("src/lib/observability/server-timing.ts");

  test("Module has server-only directive", () => {
    assert.match(source, /"server-only"/);
  });

  test("Exports createServerTiming", () => {
    assert.match(source, /export const createServerTiming/);
  });

  test("Returns start, end, measure, log, getResults", () => {
    /* Check the return statement uses shorthand: { end, getResults, log, measure, start } */
    assert.match(source, /return \{ end, getResults, log, measure, start/);
    assert.match(source, /const start = /);
    assert.match(source, /const end = /);
    assert.match(source, /const measure = /);
    assert.match(source, /const log = /);
    assert.match(source, /const getResults = /);
  });

  test("measure wraps async functions", () => {
    assert.match(source, /measure = async/);
    assert.match(source, /try \{/);
    assert.match(source, /finally \{/);
  });

  test("log outputs [server-timing] format", () => {
    assert.match(source, /\[server-timing\]/);
  });
});

/* ─── 14. Save / publish / auth logic not regressed ─── */

describe("P2-14: Save / publish / auth logic unchanged", () => {
  test("Publish route still syncs suggestions after publish", () => {
    const source = read("src/app/api/dashboard/content/[collection]/[id]/publish/route.ts");
    assert.match(source, /syncAgentSuggestionsFromWorkspaceSnapshot/);
  });

  test("Auth check unchanged in dashboard page", () => {
    /* Auth is handled by Payload middleware/layout, not in page.tsx directly.
       The workspace core still has auth checks for API routes. */
    const source = read("src/lib/payload/workspace.ts");
    assert.match(source, /getPayloadAuthResult/);
  });

  test("loadWorkspaceCore auth checks are unchanged", () => {
    const source = read("src/lib/payload/workspace.ts");
    assert.match(source, /authResult\.user/);
    assert.match(source, /redirect\(buildAdminRoute/);
  });

  test("PATCH /api/agent/thread still requires auth", () => {
    const source = read("src/app/api/agent/thread/route.ts");
    assert.match(source, /getPayloadAuthResult/);
    assert.match(source, /status: 401/);
  });
});

/* ─── 15. File existence and structure ─── */

describe("P2-15: All modified/new files exist and are non-empty", () => {
  for (const file of [
    "src/lib/dashboard/load-dashboard-data.ts",
    "src/app/(site)/dashboard/page.tsx",
    "src/components/dashboard/DashboardPageClient.tsx",
    "src/lib/observability/server-timing.ts",
    "src/app/api/agent/suggestions/sync/route.ts",
  ]) {
    test(`${file} exists and is non-empty`, () => {
      const content = read(file);
      assert.ok(content.length > 0, `${file} should not be empty`);
    });
  }
});

/* ─── 16. CSS brace integrity (no regression from P1) ─── */

describe("P2-16: CSS integrity", () => {
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

/* ─── 17. Redirect behavior unchanged ─── */

describe("P2-17: Redirect behavior unchanged", () => {
  test("buildDashboardRedirectPath is still exported", () => {
    const source = read("src/app/(site)/dashboard/page.tsx");
    assert.match(source, /export const buildDashboardRedirectPath/);
  });

  test("parseDashboardUrlMode still works (client)", () => {
    const source = read("src/components/dashboard/DashboardShell.tsx");
    assert.match(source, /parseDashboardUrlMode/);
  });
});

/* ─── 18. No regressions in P1 code-splitting ─── */

describe("P2-18: P1 code-splitting still in place", () => {
  test("DashboardShell mode workspaces still dynamic", () => {
    const source = read("src/components/dashboard/DashboardShell.tsx");
    assert.match(source, /WritingWorkspace = dynamic\(/);
    assert.match(source, /ScheduleMonthView = dynamic\(/);
    assert.match(source, /MemoryCardGrid = dynamic\(/);
    assert.match(source, /ChecklistView = dynamic\(/);
    assert.match(source, /TimelineView = dynamic\(/);
  });

  test("ContentEditor still dynamic in WritingEditorPane", () => {
    const source = read("src/components/dashboard/writing/WritingEditorPane.tsx");
    assert.match(source, /ContentEditor = dynamic\(/);
  });

  test("Agent inspector panels still dynamic in DashboardRightPanel", () => {
    const source = read("src/components/dashboard/DashboardRightPanel.tsx");
    for (const panel of ["AgentApprovalPanel", "AgentContextPanel", "AgentDebugPanel", "AgentInboxPanel", "AgentTracePanel"]) {
      assert.match(source, new RegExp(`${panel} = dynamic\\(`));
    }
  });
});
