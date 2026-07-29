import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  resolveOrchestratorRuntimeMode,
  isLangChainOrchestratorEnabled,
} from "../../../src/lib/agent/orchestration/runtime-config";

describe("orchestrator-runtime-config", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.AGENT_ORCHESTRATOR_RUNTIME;
    delete process.env.AGENT_ORCHESTRATOR_RUNTIME;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AGENT_ORCHESTRATOR_RUNTIME;
    } else {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = original;
    }
  });

  describe("resolveOrchestratorRuntimeMode", () => {
    it("returns langchain when env is not set", () => {
      assert.equal(resolveOrchestratorRuntimeMode(), "langchain");
    });

    it("ignores the retired explicit 'legacy' value", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "legacy";
      assert.equal(resolveOrchestratorRuntimeMode(), "langchain");
    });

    it("returns langchain for explicit 'langchain'", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "langchain";
      assert.equal(resolveOrchestratorRuntimeMode(), "langchain");
    });

    it("returns langchain for uppercase LANGCHAIN", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "LANGCHAIN";
      assert.equal(resolveOrchestratorRuntimeMode(), "langchain");
    });

    it("ignores mixed case retired values", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "LeGaCy";
      assert.equal(resolveOrchestratorRuntimeMode(), "langchain");
    });

    it("returns langchain for whitespace-padded langchain", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "  langchain  ";
      assert.equal(resolveOrchestratorRuntimeMode(), "langchain");
    });

    it("ignores unknown values", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "shadow";
      assert.equal(resolveOrchestratorRuntimeMode(), "langchain");
    });

    it("ignores empty values", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "";
      assert.equal(resolveOrchestratorRuntimeMode(), "langchain");
    });

    it("never throws", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "anything-here";
      assert.doesNotThrow(() => resolveOrchestratorRuntimeMode());
    });

    it("does not read secrets or API keys", () => {
      /* Runtime selection is invariant and does not touch any environment
       * secrets or database settings. */
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "legacy";
      const result = resolveOrchestratorRuntimeMode();
      assert.equal(result, "langchain");
    });
  });

  describe("isLangChainOrchestratorEnabled", () => {
    it("returns true by default", () => {
      assert.equal(isLangChainOrchestratorEnabled(), true);
    });

    it("returns true when langchain is set", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "langchain";
      assert.equal(isLangChainOrchestratorEnabled(), true);
    });

    it("cannot be disabled by the retired legacy value", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "legacy";
      assert.equal(isLangChainOrchestratorEnabled(), true);
    });
  });
});
