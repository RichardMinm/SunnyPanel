import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertPlannedVsActual,
  createEmptyTurnTrace,
  recordActualTool,
  recordPolicyTrace,
  recordRouterTrace,
} from "../../src/lib/agent/trace/agent-turn-trace";
import { evaluatePolicyGuard } from "../../src/lib/agent/policy/tool-gate";
import { normalizeRouterOutput } from "../../src/lib/agent/router/normalize-router-output";
import type { AgentIntent } from "../../src/lib/agent/schemas";

test("planned preview and actual execute pass consistency check", () => {
  const intent: AgentIntent = {
    args: { title: "学习计划" },
    intent: "create_plan",
  };
  let trace = createEmptyTurnTrace("turn-1");
  trace = recordRouterTrace(trace, normalizeRouterOutput({ intent }));
  trace = recordActualTool(trace, "execute_create_plan");

  const result = assertPlannedVsActual(trace);

  assert.equal(result.ok, true);
});

test("preview and execute capability pair passes consistency", () => {
  let trace = createEmptyTurnTrace("turn-4");
  trace = {
    ...trace,
    plannedTools: ["preview_delete_plan"],
    actualTools: ["execute_delete_plan"],
  };

  const result = assertPlannedVsActual(trace);

  assert.equal(result.ok, true);
});

test("actual tool without plan fails consistency check", () => {
  let trace = createEmptyTurnTrace("turn-2");
  trace = recordActualTool(trace, "delete_record");

  const result = assertPlannedVsActual(trace);

  assert.equal(result.ok, false);
  assert.match(result.reason, /未计划工具/);
});

test("read-only turn passes with empty planned and actual", () => {
  const result = assertPlannedVsActual(createEmptyTurnTrace());

  assert.equal(result.ok, true);
});

test("capability gate trace records allowed and blocked lists", () => {
  const intent: AgentIntent = {
    args: { title: "学习计划" },
    intent: "create_plan",
  };
  const router = normalizeRouterOutput({ intent });
  const policy = evaluatePolicyGuard(router);
  let trace = createEmptyTurnTrace("turn-3");
  trace = recordRouterTrace(trace, router);
  trace = recordPolicyTrace(trace, policy);

  assert.ok(trace.allowedCapabilities?.includes("preview_create_plan"));
  assert.ok(Array.isArray(trace.blockedCapabilities));
});
