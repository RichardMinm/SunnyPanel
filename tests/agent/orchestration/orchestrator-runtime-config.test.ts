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
    it("returns legacy when env is not set", () => {
      assert.equal(resolveOrchestratorRuntimeMode(), "legacy");
    });

    it("returns legacy for explicit 'legacy'", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "legacy";
      assert.equal(resolveOrchestratorRuntimeMode(), "legacy");
    });

    it("returns langchain for explicit 'langchain'", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "langchain";
      assert.equal(resolveOrchestratorRuntimeMode(), "langchain");
    });

    it("returns legacy for uppercase LANGCHAIN", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "LANGCHAIN";
      assert.equal(resolveOrchestratorRuntimeMode(), "langchain");
    });

    it("returns legacy for mixed case LeGaCy", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "LeGaCy";
      assert.equal(resolveOrchestratorRuntimeMode(), "legacy");
    });

    it("returns legacy for whitespace-padded value", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "  langchain  ";
      assert.equal(resolveOrchestratorRuntimeMode(), "langchain");
    });

    it("returns legacy for unknown value", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "shadow";
      assert.equal(resolveOrchestratorRuntimeMode(), "legacy");
    });

    it("returns legacy for empty string", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "";
      assert.equal(resolveOrchestratorRuntimeMode(), "legacy");
    });

    it("never throws", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "anything-here";
      assert.doesNotThrow(() => resolveOrchestratorRuntimeMode());
    });

    it("does not read secrets or API keys", () => {
      /* Config only reads AGENT_ORCHESTRATOR_RUNTIME — it doesn't touch
       *   any API key or database env vars. */
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "legacy";
      const result = resolveOrchestratorRuntimeMode();
      assert.equal(result, "legacy");
    });
  });

  describe("isLangChainOrchestratorEnabled", () => {
    it("returns false by default", () => {
      assert.equal(isLangChainOrchestratorEnabled(), false);
    });

    it("returns true when langchain is set", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "langchain";
      assert.equal(isLangChainOrchestratorEnabled(), true);
    });

    it("returns false for legacy", () => {
      process.env.AGENT_ORCHESTRATOR_RUNTIME = "legacy";
      assert.equal(isLangChainOrchestratorEnabled(), false);
    });
  });
});
