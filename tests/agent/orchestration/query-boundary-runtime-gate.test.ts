import assert from "node:assert/strict";
import test from "node:test";

import { resolveOrchestratorRuntimeMode } from "../../../src/lib/agent/orchestration/runtime-config";
import { decideAdminQueryAdoption } from "../../../src/lib/agent/query/admin-adoption";
import {
  resolveQueryAdoption,
  resolveQueryRuntime,
} from "../../../src/lib/agent/query/runtime-config";
import type { AgentIntent } from "../../../src/lib/agent/schemas";
import type { HybridQueryBoundaryModule } from "./fixtures/hybrid-query-boundary-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

const loadBoundary = (contract: string) => loadR4AGreenModule<HybridQueryBoundaryModule>(
  R4A_GREEN_MODULES.boundary,
  contract,
);

const aggregateIntent: AgentIntent = {
  args: {},
  confidence: 1,
  intent: "query_progress",
};

test("existing unset, empty, Legacy, and unknown Orchestrator values remain Legacy", () => {
  const previous = process.env.AGENT_ORCHESTRATOR_RUNTIME;
  const previousWarn = console.warn;
  try {
    console.warn = () => undefined;
    for (const value of [undefined, "", "legacy", "unknown"]) {
      if (value === undefined) delete process.env.AGENT_ORCHESTRATOR_RUNTIME;
      else process.env.AGENT_ORCHESTRATOR_RUNTIME = value;
      assert.equal(resolveOrchestratorRuntimeMode(), "legacy");
    }
    assert.equal(resolveQueryRuntime(undefined), "legacy");
    assert.equal(resolveQueryAdoption(undefined), "off");
  } finally {
    console.warn = previousWarn;
    if (previous === undefined) delete process.env.AGENT_ORCHESTRATOR_RUNTIME;
    else process.env.AGENT_ORCHESTRATOR_RUNTIME = previous;
  }
});

test("the selected Legacy Orchestrator Runtime disables the Boundary", async () => {
  const { isHybridQueryBoundaryEnabled } = await loadBoundary("runtime_gate_legacy_disabled");
  assert.equal(isHybridQueryBoundaryEnabled("legacy"), false);
});

test("only explicit LangChain Orchestrator Runtime enables the Boundary", async () => {
  const { isHybridQueryBoundaryEnabled } = await loadBoundary("runtime_gate_langchain_enabled");
  assert.equal(isHybridQueryBoundaryEnabled("langchain"), true);
});

test("Pure Query adoption remains owned by the existing Query gate", () => {
  assert.deepEqual(decideAdminQueryAdoption({
    actor: { isAdmin: true },
    adoption: "off",
    intent: aggregateIntent,
    runtime: "langchain",
  }), { adopted: false, reason: "adoption_disabled" });
  assert.deepEqual(decideAdminQueryAdoption({
    actor: { isAdmin: false },
    adoption: "admin",
    intent: aggregateIntent,
    runtime: "langchain",
  }), { adopted: false, reason: "actor_not_admin" });
  assert.deepEqual(decideAdminQueryAdoption({
    actor: { isAdmin: true },
    adoption: "admin",
    intent: aggregateIntent,
    runtime: "legacy",
  }), { adopted: false, reason: "runtime_legacy" });
});

test("client-provided admin/resource claims cannot construct an authorized snapshot", async () => {
  const { buildActorAuthorizedResourceSnapshot } = await loadBoundary("runtime_gate_client_claims_denied");
  const result = buildActorAuthorizedResourceSnapshot({
    authenticatedActor: null,
    clientClaims: { actorKind: "authenticated_payload_user", isAdmin: true, planIds: [101] },
    context: {
      checklists: [],
      now: "2026-07-17T12:00:00.000+08:00",
      pendingAction: null,
      plans: [{ id: 101, priority: "medium", state: "active", title: "Release" }],
    },
  });
  assert.deepEqual(result, { code: "actor_not_trusted", valid: false });
});

test("a server-authenticated Payload user can construct the immutable snapshot", async () => {
  const { buildActorAuthorizedResourceSnapshot } = await loadBoundary("runtime_gate_trusted_actor");
  const result = buildActorAuthorizedResourceSnapshot({
    authenticatedActor: { collection: "users", id: 7 },
    context: {
      checklists: [],
      now: "2026-07-17T12:00:00.000+08:00",
      pendingAction: null,
      plans: [{ id: 101, priority: "medium", state: "active", title: " Release  2026 " }],
    },
  });
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.snapshot, {
    actorKind: "authenticated_payload_user",
    plans: [{ id: 101, normalizedTitle: "release 2026" }],
  });
  assert.equal(Object.isFrozen(result.snapshot), true);
  assert.equal(Object.isFrozen(result.snapshot.plans), true);
});
