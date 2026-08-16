import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { decideAdminQueryAdoption } from "../../src/lib/agent/query/admin-adoption";
import {
  clearAdminQueryAdoptionObservations,
  listAdminQueryAdoptionObservations,
  recordAdminQueryAdoptionObservation,
} from "../../src/lib/agent/query/admin-adoption-observer";
import { dispatchPreResolvedQuery } from "../../src/lib/agent/query/dispatcher";
import { resolveQueryAdoption } from "../../src/lib/agent/query/runtime-config";
import type { AgentIntent } from "../../src/lib/agent/schemas";
import type { PlanProgressFacts } from "../../src/lib/agent/query/types";

const intent = (name: AgentIntent["intent"], args: Record<string, unknown> = {}) => ({
  args,
  confidence: 1,
  intent: name,
}) as AgentIntent;

const decide = (overrides: Partial<Parameters<typeof decideAdminQueryAdoption>[0]> = {}) =>
  decideAdminQueryAdoption({
    actor: { isAdmin: true },
    adoption: "admin",
    intent: intent("query_progress", { scope: "all" }),
    runtime: "langchain",
    ...overrides,
  });

const planFacts = (): PlanProgressFacts => ({
  dueDate: null,
  executionMode: "manual",
  kind: "plan_progress",
  phases: [],
  phasesProvided: true,
  planId: 7,
  priority: "medium",
  state: "active",
  storedProgressPercent: 50,
  title: "Private title must not enter adoption metadata",
  totalEstimatedDays: null,
  weeklyRhythm: null,
});

test("query adoption config is exact, default-off, and read dynamically", () => {
  assert.equal(resolveQueryAdoption(undefined), "off");
  assert.equal(resolveQueryAdoption(""), "off");
  assert.equal(resolveQueryAdoption("off"), "off");
  assert.equal(resolveQueryAdoption("admin"), "admin");
  for (const denied of ["on", "true", "ADMIN", " admin ", "unexpected"]) {
    assert.equal(resolveQueryAdoption(denied), "off");
  }

  const previous = process.env.AGENT_QUERY_ADOPTION;
  try {
    process.env.AGENT_QUERY_ADOPTION = "admin";
    assert.equal(resolveQueryAdoption(), "admin");
    process.env.AGENT_QUERY_ADOPTION = "off";
    assert.equal(resolveQueryAdoption(), "off");
  } finally {
    if (previous === undefined) delete process.env.AGENT_QUERY_ADOPTION;
    else process.env.AGENT_QUERY_ADOPTION = previous;
  }
});

test("admin adoption decision is default-deny in gate order", () => {
  assert.deepEqual(decide({ runtime: "legacy" }), { adopted: false, reason: "runtime_legacy" });
  assert.deepEqual(decide({ adoption: "off" }), { adopted: false, reason: "adoption_disabled" });
  assert.deepEqual(decide({ actor: { isAdmin: false } }), { adopted: false, reason: "actor_not_admin" });
  assert.deepEqual(decide({ intent: intent("answer_question", { answer: "already generated" }) }), {
    adopted: false,
    reason: "intent_not_eligible",
  });
});

test("admin adoption accepts only exact aggregate query argument shapes", () => {
  for (const args of [{}, { scope: "all" }, { scope: "plans" }, { scope: "checklists" }, { checklistTitle: null, scope: "all" }]) {
    assert.deepEqual(decide({ intent: intent("query_progress", args) }), {
      adopted: true,
      reason: "adopted_admin_query",
    });
  }

  for (const args of [
    { checklistTitle: "Release" },
    { checklistTitle: "", scope: "all" },
    { scope: "unknown" },
    { extra: true, scope: "all" },
  ]) {
    assert.deepEqual(decide({ intent: intent("query_progress", args) }), {
      adopted: false,
      reason: "argument_shape_not_eligible",
    });
  }
});

test("admin adoption accepts only a positive integer planId and no aliases", () => {
  assert.deepEqual(decide({ intent: intent("query_plan_progress", { planId: 7 }) }), {
    adopted: true,
    reason: "adopted_admin_query",
  });

  for (const args of [
    {},
    { planId: null },
    { planId: "7" },
    { planId: 0 },
    { planId: -1 },
    { planId: 1.5 },
    { planId: Number.POSITIVE_INFINITY },
    { planId: 7, planTitle: "Release" },
    { planId: 7, extra: true },
    { planTitle: "Release" },
  ]) {
    assert.deepEqual(decide({ intent: intent("query_plan_progress", args) }), {
      adopted: false,
      reason: "argument_shape_not_eligible",
    });
  }
});

test("excluded read, compound, and write intents never enter admin adoption", () => {
  for (const name of [
    "answer_question",
    "query_checklist_progress",
    "query_schedule",
    "evaluate_plan",
    "compound",
    "save_memory",
  ] as AgentIntent["intent"][]) {
    assert.deepEqual(decide({ intent: intent(name) }), {
      adopted: false,
      reason: "intent_not_eligible",
    });
  }
});

test("dispatcher rejects disabled or non-admin adoption before facts and Provider", async () => {
  for (const options of [
    { actor: { isAdmin: true }, adoption: "off" as const },
    { actor: { isAdmin: false }, adoption: "admin" as const },
  ]) {
    const calls = { facts: 0, legacy: 0, model: 0 };
    const result = await dispatchPreResolvedQuery({
      ...options,
      intent: intent("query_plan_progress", { planId: 7 }),
      loadFacts: async () => { calls.facts += 1; return planFacts(); },
      runCommentary: async () => {
        calls.model += 1;
        return { latencyMs: 1, modelCalls: 1, status: "accepted", text: "稳定。", ttftMs: 1 };
      },
      runLegacy: async () => { calls.legacy += 1; return { assistantMessage: "Legacy", pendingAction: null }; },
      runtime: "langchain",
    });

    assert.equal(result.outcome, "legacy");
    assert.deepEqual(calls, { facts: 0, legacy: 1, model: 0 });
  }
});

test("dispatcher adopts an exact admin query with one facts load and at most one Provider call", async () => {
  const primary = intent("query_plan_progress", { planId: 7 });
  const before = structuredClone(primary);
  const calls = { facts: 0, legacy: 0, model: 0 };
  const result = await dispatchPreResolvedQuery({
    actor: { isAdmin: true },
    adoption: "admin",
    intent: primary,
    loadFacts: async () => { calls.facts += 1; return planFacts(); },
    runCommentary: async () => {
      calls.model += 1;
      return { latencyMs: 1, modelCalls: 1, reason: "provider_error", status: "omitted", ttftMs: null };
    },
    runLegacy: async () => { calls.legacy += 1; return { assistantMessage: "Legacy", pendingAction: null }; },
    runtime: "langchain",
  });

  assert.equal(result.outcome, "complete");
  assert.deepEqual(calls, { facts: 1, legacy: 0, model: 1 });
  assert.deepEqual(primary, before);
  if (result.outcome === "complete") assert.equal(result.terminal.commentary.status, "omitted");
});

test("adoption observer is bounded, immutable, and structurally excludes raw content", () => {
  clearAdminQueryAdoptionObservations();
  for (let index = 0; index < 205; index += 1) {
    recordAdminQueryAdoptionObservation({
      adopted: false,
      adoption: "off",
      canonicalReadyMs: null,
      commentaryAddedMs: null,
      commentaryStatus: "not_started",
      factsLoaderCalls: 0,
      finalLatencyMs: index,
      intentCategory: "answer_question",
      omissionReason: null,
      providerCalls: 0,
      queryResult: "legacy",
      reason: "adoption_disabled",
      runtime: "langchain",
    });
  }

  const observations = listAdminQueryAdoptionObservations();
  assert.equal(observations.length, 200);
  assert.equal(observations[0]?.finalLatencyMs, 5);
  observations[0]!.finalLatencyMs = 99_999;
  assert.equal(listAdminQueryAdoptionObservations()[0]?.finalLatencyMs, 5);

  const serialized = JSON.stringify(observations);
  for (const forbidden of ["message", "title", "planId", "facts", "canonical", "commentaryText", "prompt", "response", "token", "secret", "reasoning"]) {
    assert.equal(Object.prototype.hasOwnProperty.call(observations[0], forbidden), false);
    assert.doesNotMatch(serialized, new RegExp(`\\"${forbidden}\\"`, "i"));
  }
});

test("dispatcher records rejected and adopted observations with only bounded counters", async () => {
  clearAdminQueryAdoptionObservations();
  await dispatchPreResolvedQuery({
    actor: { isAdmin: false },
    adoption: "admin",
    intent: intent("query_plan_progress", { planId: 7 }),
    loadFacts: async () => assert.fail("facts must not load"),
    runtime: "langchain",
  });
  await dispatchPreResolvedQuery({
    actor: { isAdmin: true },
    adoption: "admin",
    intent: intent("query_plan_progress", { planId: 7 }),
    loadFacts: async () => planFacts(),
    runCommentary: async () => ({ latencyMs: 1, modelCalls: 1, status: "accepted", text: "稳定。", ttftMs: 1 }),
    runtime: "langchain",
  });

  const observations = listAdminQueryAdoptionObservations();
  assert.equal(observations.length, 2);
  assert.deepEqual(
    observations.map(({ adopted, factsLoaderCalls, providerCalls, queryResult, reason }) => ({ adopted, factsLoaderCalls, providerCalls, queryResult, reason })),
    [
      { adopted: false, factsLoaderCalls: 0, providerCalls: 0, queryResult: "legacy", reason: "actor_not_admin" },
      { adopted: true, factsLoaderCalls: 1, providerCalls: 1, queryResult: "complete", reason: "adopted_admin_query" },
    ],
  );
});

test("production adoption derives admin status only from the authenticated server user", () => {
  const route = fs.readFileSync("src/app/api/agent/chat/route.ts", "utf8");
  const step = fs.readFileSync("src/lib/agent/chat-pipeline/legacy-heuristic-resolution-step.ts", "utf8");
  assert.match(route, /getPayloadAuthResult\(\)/);
  assert.match(route, /if \(!authResult\.user\)/);
  assert.match(
    route,
    /handleAgentChatPost\(\{\s*body,\s*signal: request\.signal,\s*user: authResult\.user,\s*\}\)/u,
  );
  assert.match(step, /actor: \{ isAdmin: user\.collection === "users" \}/);
  assert.match(step, /resolveBoundaryOwnedQueryConfig\(orchestratorPlanSource\)/);
  assert.match(step, /adoption: queryConfig\.adoption/);
  assert.doesNotMatch(step, /message\.(?:isAdmin|role)|body\.(?:isAdmin|role)/);
});

test("admin query adoption modules contain no business mutation or execution imports", () => {
  const sources = [
    "src/lib/agent/query/admin-adoption.ts",
    "src/lib/agent/query/admin-adoption-observer.ts",
    "src/lib/agent/query/dispatcher.ts",
  ].map((path) => fs.readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(sources, /payload\.(?:create|delete|update)|Executor|Receipt|Rollback|executeAgentIntent/);
});
