import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  embedText,
  resolveAgentEmbeddingConfig,
  type AgentEmbeddingConfig,
} from "../../src/lib/agent/memory-embeddings";
import { isVectorMemoryEnabled } from "../../src/lib/agent/memory-vector";

const embeddingEnvironmentKeys = [
  "AGENT_EMBEDDING_API_KEY",
  "AGENT_EMBEDDING_BASE_URL",
  "AGENT_EMBEDDING_ENABLED",
  "AGENT_EMBEDDING_MODEL",
  "AGENT_EMBEDDING_TIMEOUT_MS",
  "AGENT_VECTOR_MEMORY",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
] as const;

const withEmbeddingEnvironment = async (run: () => Promise<void> | void) => {
  const previous = Object.fromEntries(
    embeddingEnvironmentKeys.map((key) => [key, process.env[key]]),
  );
  for (const key of embeddingEnvironmentKeys) delete process.env[key];

  try {
    await run();
  } finally {
    for (const key of embeddingEnvironmentKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

const independentConfig: AgentEmbeddingConfig = {
  apiKey: "synthetic-embedding-key",
  baseURL: "https://embedding.test.example/v1",
  model: "synthetic-embedding-model",
  timeoutMs: 250,
};

describe("L3-D4 Memory embedding boundary", () => {
  it("is opt-in and does not become enabled from a legacy vector flag or chat tuple", async () => {
    await withEmbeddingEnvironment(() => {
      process.env.DEEPSEEK_API_KEY = "synthetic-chat-key";
      process.env.DEEPSEEK_BASE_URL = "https://chat.test.example/v1";
      process.env.DEEPSEEK_MODEL = "synthetic-chat-model";

      assert.equal(isVectorMemoryEnabled(), false);

      process.env.AGENT_VECTOR_MEMORY = "true";
      assert.equal(isVectorMemoryEnabled(), false);

      process.env.AGENT_EMBEDDING_ENABLED = "true";
      process.env.AGENT_EMBEDDING_API_KEY = independentConfig.apiKey;
      process.env.AGENT_EMBEDDING_BASE_URL = independentConfig.baseURL;
      process.env.AGENT_EMBEDDING_MODEL = independentConfig.model;
      assert.equal(isVectorMemoryEnabled(), true);
    });
  });

  it("resolves only an atomic embedding tuple and never inherits chat settings", () => {
    assert.equal(
      resolveAgentEmbeddingConfig({
        AGENT_EMBEDDING_ENABLED: "true",
        DEEPSEEK_API_KEY: "synthetic-chat-key",
        DEEPSEEK_BASE_URL: "https://chat.test.example/v1",
        DEEPSEEK_MODEL: "synthetic-chat-model",
      }),
      null,
    );

    assert.deepEqual(
      resolveAgentEmbeddingConfig({
        AGENT_EMBEDDING_API_KEY: independentConfig.apiKey,
        AGENT_EMBEDDING_BASE_URL: `${independentConfig.baseURL}/`,
        AGENT_EMBEDDING_ENABLED: "1",
        AGENT_EMBEDDING_MODEL: independentConfig.model,
        AGENT_EMBEDDING_TIMEOUT_MS: String(independentConfig.timeoutMs),
      }),
      independentConfig,
    );
  });

  it("fails null on embedding transport errors without reaching database code", async () => {
    let fetchCalls = 0;
    const result = await embedText("query text", {
      fetchFn: async () => {
        fetchCalls += 1;
        throw new Error("synthetic embedding transport failure");
      },
      resolveConfig: () => independentConfig,
    });

    assert.equal(fetchCalls, 1);
    assert.equal(result, null);
  });

  it("keeps the embedding transport independent from the Agent chat resolver", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/agent/memory-embeddings.ts"),
      "utf8",
    );

    assert.doesNotMatch(source, /getAgentModelConfig|resolveAgentStructuredModelConfig/u);
    assert.doesNotMatch(source, /chat\/completions|responses/u);
    assert.match(source, /AGENT_EMBEDDING_API_KEY/u);
    assert.match(source, /AGENT_EMBEDDING_BASE_URL/u);
    assert.match(source, /AGENT_EMBEDDING_MODEL/u);
  });
});
