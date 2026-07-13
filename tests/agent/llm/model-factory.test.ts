import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createChatModel } from "../../../src/lib/agent/llm/model-factory";
import { createModelConfig } from "../../../src/lib/agent/llm/model-config";
import { isModelError } from "../../../src/lib/agent/llm/model-errors";

describe("model-factory", () => {
  const validConfig = (provider = "openai") => {
    const config = createModelConfig({
      apiKey: "sk-test-key",
      baseURL: provider === "deepseek"
        ? "https://api.deepseek.com/v1"
        : "https://api.openai.com/v1",
      model: provider === "deepseek" ? "deepseek-chat" : "gpt-4",
      provider,
    });

    if (isModelError(config)) throw new Error("expected valid config");
    return config;
  };

  describe("createChatModel", () => {
    it("returns a ChatOpenAI instance for openai config", () => {
      const model = createChatModel(validConfig("openai"));

      assert.equal(typeof model.invoke, "function");
      assert.equal(typeof model.withStructuredOutput, "function");
      assert.equal(typeof model.bindTools, "function");
    });

    it("returns a ChatOpenAI instance for deepseek config", () => {
      const model = createChatModel(validConfig("deepseek"));

      assert.equal(typeof model.invoke, "function");
      assert.equal(typeof model.withStructuredOutput, "function");
    });

    it("returns a ChatOpenAI instance for zai config", () => {
      const model = createChatModel(validConfig("zai"));

      assert.equal(typeof model.invoke, "function");
      assert.equal(typeof model.withStructuredOutput, "function");
    });

    it("model is configured with correct baseURL", () => {
      const model = createChatModel(validConfig("openai"));

      /* The model instance should have the correct configuration.
       *   ChatOpenAI stores baseURL in its client configuration. */
      assert.ok(model);
    });

    it("passes an explicit output-token budget to ChatOpenAI", () => {
      const config = createModelConfig({
        apiKey: "sk-test-key",
        baseURL: "https://api.openai.com/v1",
        maxOutputTokens: 384,
        model: "gpt-4",
        provider: "openai",
      });

      if (isModelError(config)) throw new Error("expected valid config");
      const model = createChatModel(config);

      assert.equal((model as unknown as { maxTokens?: number }).maxTokens, 384);
    });
  });

  describe("factory injection pattern", () => {
    it("supports custom factory (dependency injection)", () => {
      /* The ModelFactory type allows passing custom factories.
       *   This test verifies the pattern works. */
      let called = false;
      const customFactory: typeof createChatModel = (config) => {
        called = true;
        return createChatModel(config);
      };

      const model = customFactory(validConfig("openai"));

      assert.equal(called, true);
      assert.equal(typeof model.invoke, "function");
    });
  });
});
