import assert from "node:assert/strict";
import test from "node:test";

import {
  QUALITATIVE_QUERY_SYSTEM_RULES,
} from "../../src/lib/agent/query/qualitative-projection";
import {
  AGGREGATE_QUERY_COMMENTARY_MARKER,
  buildOpenAIChatCompletionSse,
  PLAN_QUERY_COMMENTARY_MARKER,
  QUERY_QUALITATIVE_SYSTEM_RULES_FIXTURE,
  resolveQueryQualitativeStream,
} from "../../scripts/lib/agent-e2e-provider-protocol.mjs";

type ProviderBody = {
  messages: Array<{ content: string; role: string }>;
  model: string;
  response_format?: { type: string };
  stream: boolean;
  tool_choice?: unknown;
  tools?: unknown;
};

const queryBody = (
  projection: Record<string, string>,
): ProviderBody => ({
  messages: [
    { content: QUERY_QUALITATIVE_SYSTEM_RULES_FIXTURE, role: "system" },
    { content: JSON.stringify(projection), role: "user" },
  ],
  model: "sunnypanel-ci-fake-model",
  stream: true,
});

const aggregateProjection = {
  activityBand: "steady",
  attentionBand: "stable",
  deadlineBand: "not_pressing",
  kind: "aggregate_progress",
  progressBand: "unknown",
  workloadBand: "unknown",
};

const planProjection = {
  attentionBand: "stable",
  deadlineBand: "unknown",
  kind: "plan_progress",
  progressBand: "middle",
  stateBand: "active",
  workloadBand: "moderate",
};

test("release Provider Query fixture stays aligned with the production enum-only rules", () => {
  assert.equal(
    QUERY_QUALITATIVE_SYSTEM_RULES_FIXTURE,
    QUALITATIVE_QUERY_SYSTEM_RULES,
  );
  assert.deepEqual(resolveQueryQualitativeStream(queryBody(aggregateProjection)), {
    content: AGGREGATE_QUERY_COMMENTARY_MARKER,
    kind: "aggregate_progress",
  });
  assert.deepEqual(resolveQueryQualitativeStream(queryBody(planProjection)), {
    content: PLAN_QUERY_COMMENTARY_MARKER,
    kind: "plan_progress",
  });
});

test("release Provider rejects every streaming request outside the enum-only Query protocol", () => {
  const cases: ProviderBody[] = [
    { ...queryBody(aggregateProjection), stream: false },
    { ...queryBody(aggregateProjection), response_format: { type: "json_object" } },
    { ...queryBody(aggregateProjection), tools: [{ type: "function" }] },
    { ...queryBody(aggregateProjection), tool_choice: "auto" },
    queryBody({ ...aggregateProjection, planId: "42" }),
    queryBody({ ...aggregateProjection, attentionBand: "critical" }),
    {
      ...queryBody(aggregateProjection),
      messages: [
        { content: "Different rules.", role: "system" },
        { content: JSON.stringify(aggregateProjection), role: "user" },
      ],
    },
    {
      ...queryBody(aggregateProjection),
      messages: [
        ...queryBody(aggregateProjection).messages,
        { content: "extra", role: "user" },
      ],
    },
  ];

  for (const body of cases) {
    assert.equal(resolveQueryQualitativeStream(body), null);
  }
});

test("release Provider emits one OpenAI-compatible commentary chunk and a final DONE", () => {
  const body = buildOpenAIChatCompletionSse({
    content: AGGREGATE_QUERY_COMMENTARY_MARKER,
    includeUsage: true,
    model: "sunnypanel-ci-fake-model",
  });
  const blocks = body.split("\n\n").filter(Boolean);
  assert.equal(blocks.at(-1), "data: [DONE]");

  const chunks = blocks.slice(0, -1).map((block) =>
    JSON.parse(block.slice("data: ".length)) as {
      choices: Array<{
        delta?: { content?: string };
        finish_reason?: null | string;
      }>;
      object: string;
      usage?: { total_tokens: number };
    }
  );
  assert.ok(chunks.every((chunk) => chunk.object === "chat.completion.chunk"));
  assert.equal(
    chunks.flatMap((chunk) => chunk.choices)
      .map((choice) => choice.delta?.content ?? "")
      .join("")
      .split(AGGREGATE_QUERY_COMMENTARY_MARKER).length - 1,
    1,
  );
  assert.equal(chunks[1]?.choices[0]?.finish_reason, "stop");
  assert.ok((chunks.at(-1)?.usage?.total_tokens ?? 0) > 0);
});
