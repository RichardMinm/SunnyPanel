import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { relative, resolve } from "node:path";
import { test } from "node:test";

import { isSessionCoordinatorEnabled } from "../../src/lib/agent/session/coordinator-feature-flag";

const repositoryRoot = process.cwd();
const productionRoot = resolve(repositoryRoot, "src");

const collectTypeScriptFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      return collectTypeScriptFiles(path);
    }

    return /\.tsx?$/u.test(entry.name) ? [path] : [];
  });

const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

test("the retired completeStructured file and every production reference are gone", () => {
  const retiredPath = resolve(
    repositoryRoot,
    "src/lib/agent/llm/complete-structured.ts",
  );
  const references = collectTypeScriptFiles(productionRoot)
    .filter((path) => /completeStructured|complete-structured/u.test(readFileSync(path, "utf8")))
    .map((path) => relative(repositoryRoot, path));

  assert.equal(existsSync(retiredPath), false);
  assert.deepEqual(references, []);
});

test("active Schedule and Suggestions entrypoints cannot reach their retired legacy seams", () => {
  const registry = source("src/lib/agent/agents/registry.ts");
  const suggestions = source("src/lib/agent/suggestions.ts");
  const activeSources = `${registry}\n${suggestions}`;

  assert.doesNotMatch(registry, /schedule-agent|enrichScheduleIntent/u);
  assert.doesNotMatch(suggestions, /suggestions-llm|enhanceSuggestionsWithLLM/u);
  assert.doesNotMatch(activeSources, /completeStructured|complete-structured/u);
});

test("retired generic agents, prompts, suggestion enhancer, and Tool Planner runtime stay deleted", () => {
  const retiredPaths = [
    "src/lib/agent/agents/content-agent.ts",
    "src/lib/agent/agents/enrich-intent.ts",
    "src/lib/agent/agents/memory-agent.ts",
    "src/lib/agent/agents/query-agent.ts",
    "src/lib/agent/agents/review-agent.ts",
    "src/lib/agent/agents/schedule-agent.ts",
    "src/lib/agent/capabilities/function-tools.ts",
    "src/lib/agent/prompts/content.ts",
    "src/lib/agent/prompts/memory.ts",
    "src/lib/agent/prompts/query.ts",
    "src/lib/agent/prompts/review.ts",
    "src/lib/agent/prompts/schedule.ts",
    "src/lib/agent/suggestions-llm.ts",
    "src/lib/agent/tool-planner/feature-flag.ts",
    "src/lib/agent/tool-planner/langgraph-runtime.ts",
    "src/lib/agent/tool-planner/langgraph-state.ts",
    "src/lib/agent/tool-planner/llm-tool-planner.ts",
    "src/lib/agent/tool-planner/shadow-graph.ts",
    "src/lib/agent/function-tools.ts",
    "src/lib/agent/intent/llm-unified.ts",
    "src/lib/agent/plan/tool-plan.ts",
    "src/lib/agent/react-loop.ts",
    "src/lib/agent/router/capability-router.ts",
    "src/lib/agent/router/follow-up-router-output.ts",
    "src/lib/agent/router/llm-router-schema.ts",
    "src/lib/agent/router/llm-router-to-agent-router.ts",
    "src/lib/agent/router/map-llm-router-to-intent.ts",
    "src/lib/agent/router/resolve-router-chain.ts",
    "src/lib/agent/workflow/router.ts",
  ];

  assert.deepEqual(
    retiredPaths.filter((path) => existsSync(resolve(repositoryRoot, path))),
    [],
  );
});

test("the production chat pipeline has no direct intent-model or ReAct transport", () => {
  const client = source("src/lib/agent/client.ts");
  const runtimeDeps = source("src/lib/agent/chat-pipeline/runtime-deps.ts");
  const handler = source("src/lib/agent/chat-pipeline/handle-agent-chat-post.ts");
  const fullAdapter = source("src/lib/agent/langgraph/full-adapter.ts");
  const manifest = source("src/lib/agent/orchestration/orchestrator-capability-manifest.ts");
  const prompt = source("src/lib/agent/prompts.ts");
  const activeSources = `${client}\n${runtimeDeps}\n${handler}\n${fullAdapter}`;

  assert.doesNotMatch(
    activeSources,
    /generateIntentWithAgentModel|getAgentIntentModelEngine|runReactToolLoop|fetchWithRetry|\/chat\/completions/u,
  );
  assert.doesNotMatch(activeSources, /AGENT_REACT_LOOP|AGENT_FUNCTION_CALLING/u);
  assert.match(manifest, /intent-parameter-contract/u);
  assert.doesNotMatch(manifest, /function-tools/u);
  assert.doesNotMatch(prompt, /AGENT_LLM_ROUTER_V2|Router JSON/u);
});

test("the retained Tool Planner facade exposes deterministic contracts only", () => {
  const facade = source("src/lib/agent/tool-planner/index.ts");

  assert.match(facade, /buildLLMToolCatalog/u);
  assert.match(facade, /validateLLMToolPlan/u);
  assert.doesNotMatch(
    facade,
    /planToolsWithLLM|runToolPlanner|isAgentToolPlanner|isLLMToolPlannerEnabled|feature-flag|langgraph-runtime|shadow-graph/u,
  );
});

test("the deterministic Cognitive Advisory helper has no model-owned variant", () => {
  const cognitive = source("src/lib/agent/cognitive-advisory.ts");

  assert.match(cognitive, /export const buildCognitiveAdvisoryAnswer\b/u);
  assert.doesNotMatch(cognitive, /buildCognitiveAdvisoryAnswerWithModel|completeStructured|complete-structured/u);
});

test("Session Coordinator remains exact opt-in", () => {
  const previous = process.env.AGENT_SESSION_COORDINATOR;

  try {
    delete process.env.AGENT_SESSION_COORDINATOR;
    assert.equal(isSessionCoordinatorEnabled(), false);

    process.env.AGENT_SESSION_COORDINATOR = "0";
    assert.equal(isSessionCoordinatorEnabled(), false);

    process.env.AGENT_SESSION_COORDINATOR = "true";
    assert.equal(isSessionCoordinatorEnabled(), false);

    process.env.AGENT_SESSION_COORDINATOR = "1";
    assert.equal(isSessionCoordinatorEnabled(), true);
  } finally {
    if (previous === undefined) {
      delete process.env.AGENT_SESSION_COORDINATOR;
    } else {
      process.env.AGENT_SESSION_COORDINATOR = previous;
    }
  }
});
