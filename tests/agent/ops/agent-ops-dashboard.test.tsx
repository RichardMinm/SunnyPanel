import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Dashboard inspector exposes an Agent Ops tab without touching conversation rendering", () => {
  const types = read("src/components/dashboard/agent/types.ts");
  const constants = read("src/components/dashboard/agent/constants.ts");
  const rightPanel = read("src/components/dashboard/DashboardRightPanel.tsx");
  const contextInspector = read("src/components/dashboard/agent/ContextInspector.tsx");
  const messageCard = read("src/components/dashboard/agent/MessageCard.tsx");

  assert.match(types, /AgentInspectorTab = .*"ops"/s);
  assert.match(constants, /key:\s*"ops"/);
  assert.match(rightPanel, /AgentOpsPanel/);
  assert.match(rightPanel, /activeInspectorTab === "ops"/);
  assert.match(contextInspector, /tab\.key === "ops"/);
  assert.doesNotMatch(messageCard, /AgentOpsPanel/);
  assert.doesNotMatch(messageCard, /agent\/ops/);
});
