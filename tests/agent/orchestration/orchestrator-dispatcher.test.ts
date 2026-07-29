import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  resolveOrchestratorRuntimeMode,
} from "../../../src/lib/agent/orchestration/runtime-config";
import * as dispatcherModule from "../../../src/lib/agent/orchestration/orchestrator-dispatcher";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";

const { dispatchOrchestrator } = dispatcherModule;

type RuntimeDispatcher = (input: Readonly<{
  context: AgentPromptContext;
  message: string;
  runLangChain: () => Promise<Readonly<{
    reason: "invalid_query_scope";
    safeMessage: string;
    status: "unavailable";
  }>>;
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
  describe("authoritative mode = langchain", () => {
    it("always resolves to the LangChain path", () => {
      assert.equal(resolveOrchestratorRuntimeMode(), "langchain");
    });

    it("has no production Legacy import or callback", () => {
      const source = readFileSync(
        "src/lib/agent/orchestration/orchestrator-dispatcher.ts",
        "utf8",
      );
      assert.doesNotMatch(source, /runLegacy|from "\.\/orchestrator"/);
    });
  });

  describe("dispatcher contract", () => {
    it("dispatchOrchestrator has same signature as runOrchestrator", () => {
      assert.equal(typeof dispatchOrchestrator, "function");
      /* (message: string, context, signal?: AbortSignal) */
      assert.equal(dispatchOrchestrator.length, 3);
    });

    it("keeps a LangChain failure typed without another Orchestrator call", async () => {
      const dispatchForRuntime = (
        dispatcherModule as unknown as Record<string, unknown>
      ).dispatchOrchestratorResultForRuntime;
      assert.equal(typeof dispatchForRuntime, "function");
      if (typeof dispatchForRuntime !== "function") return;

      let langChainCalls = 0;
      const unavailable = {
        reason: "invalid_query_scope" as const,
        safeMessage: "typed LangChain scope failure",
        status: "unavailable" as const,
      };
      const result = await (dispatchForRuntime as RuntimeDispatcher)({
        context,
        message: "查看 Release 的进度",
        runLangChain: async () => {
          langChainCalls += 1;
          return unavailable;
        },
      });

      assert.equal(langChainCalls, 1);
      assert.deepEqual(result, unavailable);
    });
  });
});
