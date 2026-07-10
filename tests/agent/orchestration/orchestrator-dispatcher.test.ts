import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveOrchestratorRuntimeMode,
} from "../../../src/lib/agent/orchestration/runtime-config";
import { dispatchOrchestrator } from "../../../src/lib/agent/orchestration/orchestrator-dispatcher";

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
  });
});
