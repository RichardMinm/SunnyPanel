import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAgentRunOwnerWhere, getRelationId, isAgentRunOwnedByUser } from "../../src/lib/agent/run-access";

test("buildAgentRunOwnerWhere always constrains AgentRun queries to the current user", () => {
  assert.deepEqual(buildAgentRunOwnerWhere(7), { user: { equals: 7 } });
  assert.deepEqual(buildAgentRunOwnerWhere(7, { id: { equals: 12 } }), {
    and: [
      { user: { equals: 7 } },
      { id: { equals: 12 } },
    ],
  });
});

test("isAgentRunOwnedByUser resolves numeric and populated user relationships", () => {
  assert.equal(isAgentRunOwnedByUser({ user: 7 }, 7), true);
  assert.equal(isAgentRunOwnedByUser({ user: { id: 7 } }, 7), true);
  assert.equal(isAgentRunOwnedByUser({ user: 8 }, 7), false);
  assert.equal(isAgentRunOwnedByUser({}, 7), false);
  assert.equal(getRelationId({ id: 7 }), 7);
});

