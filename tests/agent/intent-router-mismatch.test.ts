import assert from "node:assert/strict";
import { test } from "node:test";

import type { AgentIntentResolutionResult } from "../../src/lib/agent/intent-resolution";
import type { RouterChainResult } from "../../src/lib/agent/router/resolve-router-chain";
import type { LLMRouterOutput } from "../../src/lib/agent/router/llm-router-schema";
import type { AgentIntent } from "../../src/lib/agent/schemas";
import type { AgentRouterOutput } from "../../src/lib/agent/router/types";

// Replicate the withRouterChain logic for testing
const withRouterChain = (
  result: AgentIntentResolutionResult,
  routerChain: RouterChainResult | null,
): AgentIntentResolutionResult =>
  routerChain && routerChain.intent.intent === result.intent.intent
    ? {
        ...result,
        llmRouterOutput: routerChain.llmRouterOutput,
        routerOutput: routerChain.routerOutput,
        routerSource: routerChain.source,
      }
    : result;

const makeResolution = (intent: string, args: Record<string, unknown> = {}): AgentIntentResolutionResult => ({
  engine: "heuristic",
  intent: {
    args,
    confidence: 1,
    intent: intent as AgentIntentResolutionResult["intent"]["intent"],
  } as AgentIntent,
});

const makeRouterChain = (intent: string): RouterChainResult => ({
  intent: {
    args: intent === "capability_query" ? { answer: "test" } : intent === "clarify" ? { question: "test" } : intent === "create_plan" ? { title: "test" } : {},
    confidence: 1,
    intent: intent as RouterChainResult["intent"]["intent"],
  } as AgentIntent,
  llmRouterOutput: {
    action: "capability" as LLMRouterOutput["action"],
    confidence: 0.8,
    needsClarification: false,
    requiresConfirmation: false,
    riskLevel: "none",
    slots: {},
    target: "unknown" as LLMRouterOutput["target"],
    userVisibleReason: "capability query",
    writeRequired: false,
  },
  routerOutput: {
    action: "capability",
    confidence: 0.8,
    intent: {
      args: intent === "capability_query" ? { answer: "test" } : intent === "clarify" ? { question: "test" } : intent === "create_plan" ? { title: "test" } : {},
      confidence: 0.8,
      intent: intent as AgentRouterOutput["intent"]["intent"],
    } as AgentIntent,
    reason: "capability query",
    requiresWrite: false,
    target: {},
  },
  source: "capability",
});

test("withRouterChain attaches when intents match", () => {
  const resolution = makeResolution("capability_query", { answer: "test" });
  const chain = makeRouterChain("capability_query");
  const result = withRouterChain(resolution, chain);

  assert.ok(result.llmRouterOutput);
  assert.ok(result.routerOutput);
  assert.equal(result.routerSource, "capability");
});

test("withRouterChain skips attachment when intents mismatch", () => {
  // Simulates: router said capability_query but LLM+arbitration resolved to clarify
  const resolution = makeResolution("clarify", { question: "test" });
  const chain = makeRouterChain("capability_query");
  const result = withRouterChain(resolution, chain);

  assert.equal(result.llmRouterOutput, undefined);
  assert.equal(result.routerOutput, undefined);
  assert.equal(result.routerSource, undefined);
});

test("withRouterChain skips when routerChain is null", () => {
  const resolution = makeResolution("create_plan", { title: "test" });
  const result = withRouterChain(resolution, null);

  assert.equal(result.llmRouterOutput, undefined);
  assert.equal(result.routerOutput, undefined);
});
