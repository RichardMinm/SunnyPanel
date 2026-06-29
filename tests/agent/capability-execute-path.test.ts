import assert from "node:assert/strict";
import { test } from "node:test";

import {
  executeCapabilityForPreview,
  runExecuteCapability,
} from "../../src/lib/agent/capabilities/adapters";
import type { ProposedAgentAction } from "../../src/lib/agent/schemas";

test("preview capabilities map to execute counterparts", () => {
  assert.equal(executeCapabilityForPreview("preview_delete_plan"), "execute_delete_plan");
  assert.equal(executeCapabilityForPreview("preview_create_schedule"), "execute_create_schedule");
  assert.equal(executeCapabilityForPreview("preview_delete_checklist"), "execute_delete_checklist");
});

const basePending = (): ProposedAgentAction => ({
  args: { entityName: "计划A", entityType: "plan" },
  changes: [],
  id: "action-1",
  intent: "delete_record",
  riskLevel: "high",
  summary: "删除计划A",
  capability: "preview_delete_plan",
});

test("runExecuteCapability rejects preview execute mismatch", async () => {
  const result = await runExecuteCapability(
    "execute_delete_schedule",
    {},
    {
      confirmedPreviewId: "action-1",
      pendingAction: basePending(),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "capability_mismatch");
});

test("runExecuteCapability rejects action id mismatch", async () => {
  const result = await runExecuteCapability(
    "execute_delete_plan",
    {},
    {
      confirmedPreviewId: "other-id",
      pendingAction: basePending(),
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "action_id_mismatch");
});

test("runExecuteCapability rejects structured capability mismatch", async () => {
  const result = await runExecuteCapability(
    "execute_delete_plan",
    {},
    {
      confirmedPreviewId: "action-1",
      pendingAction: basePending(),
      structuredCapability: "preview_delete_schedule",
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "structured_capability_mismatch");
});
