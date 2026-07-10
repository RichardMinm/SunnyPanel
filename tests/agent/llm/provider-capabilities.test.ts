import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getProviderCapabilities,
  getStructuredOutputMode,
  mapStatusCodeToError,
} from "../../../src/lib/agent/llm/provider-capabilities";

describe("provider-capabilities", () => {
  describe("getProviderCapabilities", () => {
    it("returns openai profile with native json schema", () => {
      const caps = getProviderCapabilities("openai");

      assert.equal(caps.provider, "openai");
      assert.equal(caps.supportsStreaming, true);
      assert.equal(caps.supportsToolCalling, true);
      assert.equal(caps.supportsNativeJsonSchema, true);
      assert.equal(caps.structuredOutputMode, "native_json_schema");
    });

    it("returns DeepSeek V4-Pro profile with prompt_json mode", () => {
      const caps = getProviderCapabilities("deepseek");

      assert.equal(caps.provider, "deepseek");
      assert.equal(caps.supportsStreaming, true);
      assert.equal(caps.supportsToolCalling, false);
      assert.equal(caps.supportsNativeJsonSchema, false);
      assert.equal(caps.structuredOutputMode, "prompt_json");
    });

    it("returns zai profile with function_calling mode", () => {
      const caps = getProviderCapabilities("zai");

      assert.equal(caps.provider, "zai");
      assert.equal(caps.supportsToolCalling, true);
      assert.equal(caps.structuredOutputMode, "function_calling");
    });

    it("returns conservative profile for openai-compatible", () => {
      const caps = getProviderCapabilities("openai-compatible");

      assert.equal(caps.provider, "openai-compatible");
      assert.equal(caps.supportsToolCalling, false);
      assert.equal(caps.supportsNativeJsonSchema, false);
      assert.equal(caps.structuredOutputMode, "prompt_json");
    });

    it("returns conservative profile for unknown provider", () => {
      const caps = getProviderCapabilities("some-random-provider");

      assert.equal(caps.provider, "some-random-provider");
      assert.equal(caps.supportsToolCalling, false);
      assert.equal(caps.supportsNativeJsonSchema, false);
      assert.equal(caps.structuredOutputMode, "prompt_json");
    });

    it("profiles are internally consistent", () => {
      const all = [
        getProviderCapabilities("openai"),
        getProviderCapabilities("deepseek"),
        getProviderCapabilities("zai"),
        getProviderCapabilities("openai-compatible"),
        getProviderCapabilities("unknown"),
      ];

      for (const caps of all) {
        if (caps.supportsNativeJsonSchema) {
          assert.equal(caps.structuredOutputMode, "native_json_schema",
            `${caps.provider}: native json → mode must be native_json_schema`);
        }
      }
    });
  });

  describe("getStructuredOutputMode", () => {
    it("returns native_json_schema for openai", () => {
      assert.equal(getStructuredOutputMode("openai"), "native_json_schema");
    });

    it("returns prompt_json for deepseek", () => {
      assert.equal(getStructuredOutputMode("deepseek"), "prompt_json");
    });

    it("returns prompt_json for unknown", () => {
      assert.equal(getStructuredOutputMode("unknown"), "prompt_json");
    });
  });

  describe("mapStatusCodeToError", () => {
    it("maps 401 to AUTH_FAILED for all providers", () => {
      assert.equal(mapStatusCodeToError("openai", 401), "MODEL_AUTH_FAILED");
      assert.equal(mapStatusCodeToError("deepseek", 401), "MODEL_AUTH_FAILED");
      assert.equal(mapStatusCodeToError("unknown", 401), "MODEL_AUTH_FAILED");
    });

    it("maps 429 to RATE_LIMITED for all providers", () => {
      assert.equal(mapStatusCodeToError("openai", 429), "MODEL_RATE_LIMITED");
      assert.equal(mapStatusCodeToError("deepseek", 429), "MODEL_RATE_LIMITED");
    });

    it("maps 5xx to UNAVAILABLE", () => {
      assert.equal(mapStatusCodeToError("openai", 500), "MODEL_UNAVAILABLE");
      assert.equal(mapStatusCodeToError("openai", 502), "MODEL_UNAVAILABLE");
      assert.equal(mapStatusCodeToError("openai", 503), "MODEL_UNAVAILABLE");
    });

    it("maps unknown status to UNAVAILABLE", () => {
      assert.equal(mapStatusCodeToError("openai", 418), "MODEL_UNAVAILABLE");
    });
  });
});
