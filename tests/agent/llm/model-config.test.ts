import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createModelConfig, summarizeModelConfig, isModelConfigValid } from "../../../src/lib/agent/llm/model-config";
import { isModelError } from "../../../src/lib/agent/llm/model-errors";

describe("model-config", () => {
  const validParams = {
    apiKey: "sk-test-key-123",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4",
    provider: "openai",
  };

  describe("createModelConfig", () => {
    it("creates valid config for openai", () => {
      const config = createModelConfig(validParams);

      assert.equal(isModelError(config), false);
      if (isModelError(config)) throw new Error("expected config not error");

      assert.equal(config.provider, "openai");
      assert.equal(config.apiKey, "sk-test-key-123");
      assert.equal(config.baseURL, "https://api.openai.com/v1");
      assert.equal(config.model, "gpt-4");
      assert.ok(config.temperature > 0);
      assert.ok(config.timeoutMs > 0);
    });

    it("creates valid config for deepseek", () => {
      const config = createModelConfig({
        ...validParams,
        provider: "deepseek",
        baseURL: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
      });

      assert.equal(isModelError(config), false);
      if (isModelError(config)) throw new Error("expected config not error");
      assert.equal(config.provider, "deepseek");
      assert.equal(config.model, "deepseek-chat");
    });

    it("creates valid config for zai", () => {
      const config = createModelConfig({
        ...validParams,
        provider: "zai",
        baseURL: "https://api.z.ai/v1",
        model: "zai-model",
      });

      assert.equal(isModelError(config), false);
      if (isModelError(config)) throw new Error("expected config not error");
      assert.equal(config.provider, "zai");
    });

    it("returns error for empty apiKey", () => {
      const result = createModelConfig({ ...validParams, apiKey: "" });

      assert.equal(isModelError(result), true);
      if (!isModelError(result)) throw new Error("expected error");
      assert.equal(result.code, "MODEL_NOT_CONFIGURED");
      assert.equal(result.retryable, false);
    });

    it("returns error for empty apiKey (whitespace only)", () => {
      const result = createModelConfig({ ...validParams, apiKey: "   " });

      assert.equal(isModelError(result), true);
      if (!isModelError(result)) throw new Error("expected error");
      assert.equal(result.code, "MODEL_NOT_CONFIGURED");
    });

    it("returns error for empty baseURL", () => {
      const result = createModelConfig({ ...validParams, baseURL: "" });

      assert.equal(isModelError(result), true);
    });

    it("returns error for empty model", () => {
      const result = createModelConfig({ ...validParams, model: "" });

      assert.equal(isModelError(result), true);
    });

    it("applies default temperature", () => {
      const config = createModelConfig(validParams);

      if (isModelError(config)) throw new Error("expected config not error");
      assert.equal(config.temperature, 0.3);
    });

    it("respects custom temperature", () => {
      const config = createModelConfig({ ...validParams, temperature: 0.7 });

      if (isModelError(config)) throw new Error("expected config not error");
      assert.equal(config.temperature, 0.7);
    });

    it("normalizes trailing slashes in baseURL", () => {
      const config = createModelConfig({
        ...validParams,
        baseURL: "https://api.openai.com/v1///",
      });

      if (isModelError(config)) throw new Error("expected config not error");
      assert.equal(config.baseURL, "https://api.openai.com/v1");
    });
  });

  describe("summarizeModelConfig", () => {
    it("never includes apiKey", () => {
      const config = createModelConfig(validParams);

      if (isModelError(config)) throw new Error("expected config not error");
      const summary = summarizeModelConfig(config);

      assert.ok(!summary.includes("sk-test-key-123"));
      assert.ok(!summary.includes(config.apiKey));
      assert.ok(summary.includes("openai"));
      assert.ok(summary.includes("gpt-4"));
      assert.ok(summary.includes("api.openai.com"));
      assert.ok(!summary.includes("/v1")); // only origin
    });

    it("format is provider/model @ origin", () => {
      const config = createModelConfig(validParams);

      if (isModelError(config)) throw new Error("expected config not error");
      const summary = summarizeModelConfig(config);

      assert.match(summary, /^openai\/gpt-4 @ https:\/\/api\.openai\.com$/);
    });
  });

  describe("isModelConfigValid", () => {
    it("returns true for complete config", () => {
      const config = createModelConfig(validParams);

      if (isModelError(config)) throw new Error("expected config not error");
      assert.equal(isModelConfigValid(config), true);
    });

    it("returns false for empty apiKey", () => {
      /* Can't construct with empty key, so test manually */
      const config = createModelConfig(validParams);

      if (isModelError(config)) throw new Error("expected config not error");
      /* Create a mutable copy to test (the actual config is frozen) */
      const invalidConfig = { ...config, apiKey: "" };

      assert.equal(isModelConfigValid(invalidConfig as unknown as Parameters<typeof isModelConfigValid>[0]), false);
    });
  });

  describe("no cross-provider mixing", () => {
    it("config is atomically tied to one provider", () => {
      /* The config contains exactly one provider, one key, one baseURL, one model.
       *   There is no scenario where you get a deepseek key + openai baseURL. */
      const config = createModelConfig({
        apiKey: "sk-deepseek",
        baseURL: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        provider: "deepseek",
      });

      if (isModelError(config)) throw new Error("expected config not error");
      assert.equal(config.provider, "deepseek");
      assert.ok(config.baseURL.includes("deepseek"));
    });
  });
});
