import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import type { AgentSuggestion } from "../../src/payload-types";
import {
  syncAgentSuggestionsFromWorkspaceSnapshot,
  type SyncAgentSuggestionsDeps,
} from "../../src/lib/agent/suggestions";
import {
  generateSuggestionsFromWorkspaceSnapshot,
  type AgentSuggestionSnapshot,
} from "../../src/lib/agent/suggestions-core";
import type { WorkspaceSnapshot } from "../../src/lib/payload/workspace";

const currentReview = () => new Date().toISOString();

const snapshotWithOverduePlan = (): AgentSuggestionSnapshot => ({
  agent: {
    recentReviews: [{ reviewedAt: currentReview() }],
    recentRuns: [],
  },
  execution: {
    recentContentWithoutPlans: [],
    recentPrivateReady: [],
    recentPublicContent: [],
    timelineCandidates: [],
  },
  plans: {
    active: [
      {
        dueDate: "2000-01-01T00:00:00.000Z",
        id: 12,
        priority: "high",
        state: "active",
        title: "收口 Agent 模型边界",
      },
    ],
    backlog: [],
    paused: [],
  },
});

const emptySnapshot = (): AgentSuggestionSnapshot => ({
  agent: {
    recentReviews: [{ reviewedAt: currentReview() }],
    recentRuns: [],
  },
  execution: {
    recentContentWithoutPlans: [],
    recentPrivateReady: [],
    recentPublicContent: [],
    timelineCandidates: [],
  },
  plans: {
    active: [],
    backlog: [],
    paused: [],
  },
});

const asWorkspaceSnapshot = (snapshot: AgentSuggestionSnapshot) =>
  snapshot as unknown as WorkspaceSnapshot;

test("suggestion sync persists the exact deterministic draft structure and unique key", async () => {
  const snapshot = snapshotWithOverduePlan();
  const expected = generateSuggestionsFromWorkspaceSnapshot(snapshot);
  const creates: Array<Record<string, unknown>> = [];
  const updates: Array<Record<string, unknown>> = [];
  let finds = 0;

  assert.equal(expected.length, 1);

  const getPayloadClient: SyncAgentSuggestionsDeps["getPayloadClient"] = async () => ({
    create: (async (input: Record<string, unknown>) => {
      creates.push(input);
      return input.data;
    }) as never,
    find: (async () => {
      finds += 1;
      return { docs: [] };
    }) as never,
    update: (async (input: Record<string, unknown>) => {
      updates.push(input);
      return input.data;
    }) as never,
  });

  await syncAgentSuggestionsFromWorkspaceSnapshot(asWorkspaceSnapshot(snapshot), {
    getPayloadClient,
  });

  assert.equal(finds, 1);
  assert.equal(creates.length, 1);
  assert.equal(updates.length, 0);
  assert.deepEqual(creates[0]?.data, {
    acceptedAt: null,
    completedAt: null,
    createdBy: expected[0]?.createdBy,
    dismissedAt: null,
    reason: expected[0]?.reason,
    relatedContent: expected[0]?.relatedContent,
    relatedPlan: expected[0]?.relatedPlan,
    riskLevel: expected[0]?.riskLevel,
    source: expected[0]?.source,
    status: "pending",
    suggestedPrompt: expected[0]?.suggestedPrompt,
    title: expected[0]?.title,
    uniqueKey: expected[0]?.uniqueKey,
  });
  assert.equal(
    (creates[0]?.data as { uniqueKey?: unknown }).uniqueKey,
    expected[0]?.uniqueKey,
  );
});

test("an empty deterministic suggestion set performs no payload read or write", async () => {
  let payloadClientRequests = 0;

  await syncAgentSuggestionsFromWorkspaceSnapshot(asWorkspaceSnapshot(emptySnapshot()), {
    getPayloadClient: async () => {
      payloadClientRequests += 1;
      throw new Error("payload must not be loaded for an empty candidate set");
    },
  });

  assert.equal(payloadClientRequests, 0);
});

test("accepted, done, and cooling-down dismissed suggestions are never reopened", async () => {
  const snapshot = snapshotWithOverduePlan();
  const draft = generateSuggestionsFromWorkspaceSnapshot(snapshot)[0];

  assert.ok(draft);

  for (const status of ["accepted", "done", "dismissed"] as const) {
    let creates = 0;
    let updates = 0;
    const existing = {
      ...draft,
      acceptedAt: status === "accepted" ? currentReview() : null,
      completedAt: status === "done" ? currentReview() : null,
      dismissedAt: status === "dismissed" ? currentReview() : null,
      id: 120,
      status,
    } as unknown as AgentSuggestion;

    const getPayloadClient: SyncAgentSuggestionsDeps["getPayloadClient"] = async () => ({
      create: (async () => {
        creates += 1;
        return existing;
      }) as never,
      find: (async () => ({ docs: [existing] })) as never,
      update: (async () => {
        updates += 1;
        return existing;
      }) as never,
    });

    await syncAgentSuggestionsFromWorkspaceSnapshot(asWorkspaceSnapshot(snapshot), {
      getPayloadClient,
    });

    assert.equal(creates, 0, `${status} suggestion must not be recreated`);
    assert.equal(updates, 0, `${status} suggestion must not be reopened`);
  }
});

test("the active suggestion sync has no model enhancer or legacy structured dependency", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/lib/agent/suggestions.ts"),
    "utf8",
  );

  assert.doesNotMatch(source, /suggestions-llm|enhanceSuggestionsWithLLM/u);
  assert.doesNotMatch(source, /completeStructured|complete-structured/u);
  assert.match(source, /generateSuggestionsFromWorkspaceSnapshot\(snapshot\)/u);
});
