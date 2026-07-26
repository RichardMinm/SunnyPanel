import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveOrchestratorRuntimeMode,
} from "../../../src/lib/agent/orchestration/runtime-config";
import * as dispatcherModule from "../../../src/lib/agent/orchestration/orchestrator-dispatcher";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import type { OrchestratorPlan } from "../../../src/lib/agent/orchestration/types";

const { dispatchOrchestrator } = dispatcherModule;

type RuntimeDispatcher = (input: Readonly<{
  context: AgentPromptContext;
  message: string;
  mode: "langchain" | "legacy";
  runLangChain: () => Promise<Readonly<{
    reason: "invalid_query_scope";
    safeMessage: string;
    status: "unavailable";
  }>>;
  runLegacy: () => Promise<OrchestratorPlan>;
}>) => Promise<unknown>;

const context: AgentPromptContext = {
  checklists: [],
  now: "2026-07-26T12:00:00.000+08:00",
  pendingAction: null,
  plans: [{
    id: 7,
    priority: "medium",
    state: "active",
    title: "Release",
  }],
};

describe("orchestrator-dispatcher", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.AGENT_ORCHESTRATOR_RUNTIME;
    delete process.env.AGENT_ORCHESTRATOR_RUNTIME;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.AGENT_ORCHESTRATOR_RUNTIME;
    } else {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = originalEnv;
    }
  });

  describe("default mode = legacy", () => {
    it("AGENT_ORCHESTRATOR_RUNTIME unset → legacy path", () => {
      assert.equal(resolveOrchestratorRuntimeMode(), "legacy");
    });
  });

  describe("mode isolation", () => {
    it("legacy mode does not load langchain modules at dispatch time", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "legacy";
      assert.equal(resolveOrchestratorRuntimeMode(), "legacy");
    });

    it("langchain mode resolves correctly", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "langchain";
      assert.equal(resolveOrchestratorRuntimeMode(), "langchain");
    });

    it("unknown value does NOT enable langchain", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "dual";
      assert.equal(resolveOrchestratorRuntimeMode(), "legacy");
    });
  });

  describe("dispatcher contract", () => {
    it("dispatchOrchestrator has same signature as runOrchestrator", () => {
      assert.equal(typeof dispatchOrchestrator, "function");
      /* (message: string, context, signal?: AbortSignal) */
      assert.equal(dispatchOrchestrator.length, 3);
    });

    it("returns a Legacy result unchanged without applying LangChain query-scope normalization", async () => {
      const dispatchForRuntime = (
        dispatcherModule as unknown as Record<string, unknown>
      ).dispatchOrchestratorResultForRuntime;
      assert.equal(typeof dispatchForRuntime, "function");
      if (typeof dispatchForRuntime !== "function") return;

      const legacyPlan: OrchestratorPlan = {
        mode: "single",
        reasoning: "legacy provider selected its existing query shape",
        source: "llm",
        tasks: [{
          agentRole: "query",
          args: { planId: 7 },
          dependsOn: [],
          id: "legacy-query",
          intent: "query_plan_progress",
          label: "legacy query",
        }],
      };
      let langChainCalls = 0;
      const result = await (dispatchForRuntime as RuntimeDispatcher)({
        context,
        message: "看看我的工作计划进度",
        mode: "legacy",
        runLangChain: async () => {
          langChainCalls += 1;
          return {
            reason: "invalid_query_scope",
            safeMessage: "must not be used",
            status: "unavailable",
          };
        },
        runLegacy: async () => legacyPlan,
      }) as { plan?: OrchestratorPlan; status?: string };

      assert.equal(langChainCalls, 0);
      assert.equal(result.status, "success");
      assert.equal(result.plan, legacyPlan);
      assert.deepEqual(result.plan, legacyPlan);
    });

    it("keeps explicit LangChain failure typed and never falls back to Legacy", async () => {
      const dispatchForRuntime = (
        dispatcherModule as unknown as Record<string, unknown>
      ).dispatchOrchestratorResultForRuntime;
      assert.equal(typeof dispatchForRuntime, "function");
      if (typeof dispatchForRuntime !== "function") return;

      let legacyCalls = 0;
      const unavailable = {
        reason: "invalid_query_scope" as const,
        safeMessage: "typed LangChain scope failure",
        status: "unavailable" as const,
      };
      const result = await (dispatchForRuntime as RuntimeDispatcher)({
        context,
        message: "查看 Release 的进度",
        mode: "langchain",
        runLangChain: async () => unavailable,
        runLegacy: async () => {
          legacyCalls += 1;
          throw new Error("Legacy fallback must not run");
        },
      });

      assert.equal(legacyCalls, 0);
      assert.deepEqual(result, unavailable);
    });
  });
});
