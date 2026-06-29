import assert from "node:assert/strict";
import { test } from "node:test";

import {
  capabilityForLegacyIntent,
  executeCapabilityForPreview,
  legacyIntentForCapability,
} from "../../src/lib/agent/capabilities/adapters";
import {
  CAPABILITY_REGISTRY,
  getCapability,
  isExecuteCapabilityName,
  listExposableCapabilities,
} from "../../src/lib/agent/capabilities/registry";

test("capability registry contains search preview execute metadata", () => {
  assert.ok(getCapability("search_plans"));
  assert.ok(getCapability("preview_delete_plan"));
  assert.ok(getCapability("execute_delete_plan"));
  assert.equal(CAPABILITY_REGISTRY.execute_bulk_delete_plans.risk, "dangerous");
});

test("exposable capabilities never include execute or dangerous", () => {
  const exposable = listExposableCapabilities();

  for (const cap of exposable) {
    assert.equal(cap.exposableToLLM, true);
    assert.notEqual(cap.risk, "write_execute");
    assert.notEqual(cap.risk, "dangerous");
    assert.ok(!isExecuteCapabilityName(cap.name), `${cap.name} should not be exposable`);
  }
});

test("legacy intent maps to preview and execute capability pairs", () => {
  assert.equal(capabilityForLegacyIntent("delete_record", "preview"), "preview_delete_plan");
  assert.equal(capabilityForLegacyIntent("delete_record", "execute"), "execute_delete_plan");
  assert.equal(legacyIntentForCapability("preview_create_schedule"), "compose_schedule_item");
  assert.equal(executeCapabilityForPreview("preview_delete_plan"), "execute_delete_plan");
});

test("buildCapabilityFunctionTools omits execute names", async () => {
  const { buildCapabilityFunctionTools } = await import("../../src/lib/agent/capabilities/function-tools");
  const tools = buildCapabilityFunctionTools(Object.keys(CAPABILITY_REGISTRY));

  assert.ok(tools.every((tool) => !tool.function.name.startsWith("execute_")));
  assert.ok(tools.every((tool) => tool.function.name !== "publish_private_content"));
});
