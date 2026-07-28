import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("chat UI retains only the bounded rollback source run ID", () => {
  const files = [
    "src/components/dashboard/agent-chat/use-agent-chat-messaging.ts",
    "src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts",
    "src/components/dashboard/agent/AgentArtifactsPanel.tsx",
    "src/components/dashboard/agent/AgentTracePanel.tsx",
    "src/components/dashboard/DashboardRightPanel.tsx",
    "src/components/dashboard/DashboardShell.tsx",
    "src/components/dashboard/DashboardPageClient.tsx",
  ];
  const source = files.map(read).join("\n");

  assert.doesNotMatch(source, /lastRollbackPayload|setLastRollbackPayload/);
  assert.match(source, /lastRollbackSourceRunId/);
  assert.doesNotMatch(read("src/components/dashboard/agent/AgentArtifactsPanel.tsx"), /parseRollbackPayload|isRollbackPayloadExecutable/);
});

test("both rollback UI actions POST sourceRunId without executable payloads", () => {
  const messaging = read("src/components/dashboard/agent-chat/use-agent-chat-messaging.ts");
  const dashboard = read("src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts");

  assert.match(messaging, /JSON\.stringify\(\{\s*sourceRunId:\s*lastRollbackSourceRunId\s*\}\)/s);
  assert.match(dashboard, /JSON\.stringify\(\{\s*sourceRunId:\s*selectedRunDetail\.id\s*\}\)/s);
  assert.doesNotMatch(`${messaging}\n${dashboard}`, /JSON\.stringify\(\{[^}]*rollbackPayload/s);
});

test("a successful thread refresh preserves the current Receipt state when requested", () => {
  const dashboard = read(
    "src/components/dashboard/agent-chat/use-agent-dashboard-chat.ts",
  );
  const successfulLoadBranch = dashboard.slice(
    dashboard.indexOf("setPendingAction(selectedThread.pendingAction)"),
  );

  assert.match(
    successfulLoadBranch,
    /if \(!options\?\.preserveInspector\) \{\s*setLastRollbackSourceRunId\(null\);\s*setLastRollbackResult\(null\);\s*setArtifactsRollbackError\(null\);\s*setSelectedRunRollbackError\(null\);\s*setActiveInspectorTab\(/s,
  );
});
