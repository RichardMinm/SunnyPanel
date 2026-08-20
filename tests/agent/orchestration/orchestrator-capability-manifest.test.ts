import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_INTENT_PARAMETER_HINTS,
  AGENT_INTENT_REQUIRED_FIELDS,
} from "../../../src/lib/agent/orchestration/intent-parameter-contract";
import { ROUTER_INTENT_NAMES } from "../../../src/lib/agent/llm/schemas/router-output";
import {
  buildLangChainOrchestratorMessages,
} from "../../../src/lib/agent/orchestration/langchain-orchestrator";
import {
  buildOrchestratorCapabilityManifest,
  ORCHESTRATOR_CAPABILITY_MANIFEST_VERSION,
} from "../../../src/lib/agent/orchestration/orchestrator-capability-manifest";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import { buildLLMToolCatalog } from "../../../src/lib/agent/tool-planner/build-tool-catalog";

const emptyContext: AgentPromptContext = {
  checklists: [],
  now: "2026-07-29T10:00:00.000+08:00",
  pendingAction: null,
  plans: [],
  schedules: [],
};

test("capability manifest is generated from the registered tool catalog and Router allowlist", () => {
  const manifest = buildOrchestratorCapabilityManifest();
  const catalogNames = buildLLMToolCatalog()
    .filter((tool) => ["draft", "read", "write"].includes(tool.capability))
    .map((tool) => tool.name);

  assert.deepEqual(manifest.map(({ intent }) => intent), catalogNames);
  assert.ok(manifest.every(({ intent }) => ROUTER_INTENT_NAMES.includes(intent)));
  assert.ok(manifest.every(({ directExecutionAllowed }) => directExecutionAllowed === false));
});

test("capability manifest uses the shared function argument contract", () => {
  const manifest = buildOrchestratorCapabilityManifest();

  for (const entry of manifest) {
    const hints = AGENT_INTENT_PARAMETER_HINTS[
      entry.intent as keyof typeof AGENT_INTENT_PARAMETER_HINTS
    ];
    const expectedRequired = AGENT_INTENT_REQUIRED_FIELDS[
      entry.intent as keyof typeof AGENT_INTENT_REQUIRED_FIELDS
    ] ?? [];

    assert.deepEqual(entry.requiredArgs, expectedRequired);
    assert.deepEqual(
      [...entry.requiredArgs, ...entry.optionalArgs].sort(),
      Object.keys(hints).sort(),
    );
  }
});

test("per-turn availability forces missing existing resources to clarify", () => {
  const emptyManifest = buildOrchestratorCapabilityManifest(emptyContext);
  const appendWithoutChecklist = emptyManifest.find(
    ({ intent }) => intent === "append_plan_item",
  );
  const createPlan = emptyManifest.find(({ intent }) => intent === "create_plan");

  assert.equal(
    appendWithoutChecklist?.availability,
    "clarify_only_missing_resource",
  );
  assert.equal(createPlan?.availability, "available");

  const contextWithChecklist: AgentPromptContext = {
    ...emptyContext,
    checklists: [{
      groups: [],
      id: 21,
      title: "FastJSON 漏洞复现清单",
    }],
  };
  const readyManifest = buildOrchestratorCapabilityManifest(
    contextWithChecklist,
  );
  assert.equal(
    readyManifest.find(({ intent }) => intent === "append_plan_item")
      ?.availability,
    "requires_explicit_resource_reference",
  );
});

test("production messages carry the trusted manifest while workspace context remains user data", () => {
  const messages = buildLangChainOrchestratorMessages(
    "把 FastJSON 研究加入清单",
    emptyContext,
  );
  const system = messages.find(({ role }) => role === "system")?.content ?? "";
  const user = messages.filter(({ role }) => role === "user")
    .map(({ content }) => content)
    .join("\n");

  assert.match(system, new RegExp(ORCHESTRATOR_CAPABILITY_MANIFEST_VERSION));
  assert.match(system, /append_plan_item[^]*clarify_only_missing_resource/);
  assert.match(system, /directExecutionAllowed 对所有条目恒为 false/);
  assert.doesNotMatch(system, /当前时间：2026-07-29/);
  assert.match(user, /当前时间：2026-07-29/);
});
