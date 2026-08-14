import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";

import { invokeStructured } from "../../../src/lib/agent/llm/invoke-structured";
import { createModelConfig } from "../../../src/lib/agent/llm/model-config";
import { isModelError } from "../../../src/lib/agent/llm/model-errors";
import { inspectSafeProviderResponse } from "../../../src/lib/agent/llm/structured-protocol";

const response = (body: unknown) => new Response(JSON.stringify(body), {
  headers: { "content-type": "application/json" },
  status: 200,
});

const message = (text: string) => ({
  content: [{ annotations: [], text, type: "output_text" }],
  id: "msg_synthetic",
  role: "assistant",
  status: "completed",
  type: "message",
});

const responsesEnvelope = (text: string, status = "completed") => ({
  created_at: 1,
  error: null,
  id: "resp_synthetic",
  incomplete_details: status === "incomplete" ? { reason: "max_output_tokens" } : null,
  instructions: null,
  max_output_tokens: 256,
  metadata: {},
  model: "deepseek-v4-flash",
  object: "response",
  output: [message(text)],
  parallel_tool_calls: true,
  previous_response_id: null,
  status,
  store: false,
  temperature: 0.1,
  text: { format: { type: "json_schema" } },
  tool_choice: "auto",
  tools: [],
  top_p: 1,
  truncation: "disabled",
  usage: {
    input_tokens: 4,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: 4,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 8,
  },
  user: null,
});

describe("DeepSeek Responses protocol diagnostics", () => {
  it("recognizes a completed output envelope without retaining content", async () => {
    const observation = await inspectSafeProviderResponse(response({
      id: "resp_synthetic",
      object: "response",
      output: [message("SENSITIVE_SYNTHETIC_OUTPUT")],
      status: "completed",
    }));

    assert.deepEqual(observation, {
      choicesState: "present",
      contentState: "present",
      finishReason: "stop",
      httpStatusClass: "2xx",
      reasoningPresent: false,
      responseReceived: true,
      toolCallsPresent: false,
    });
    assert.equal(JSON.stringify(observation).includes("SENSITIVE_SYNTHETIC_OUTPUT"), false);
  });

  it("maps incomplete and failed terminals to non-success finish reasons", async () => {
    const incomplete = await inspectSafeProviderResponse(response({
      object: "response",
      output: [message("partial")],
      status: "incomplete",
    }));
    const failed = await inspectSafeProviderResponse(response({
      object: "response",
      output: [],
      status: "failed",
    }));

    assert.equal(incomplete.finishReason, "length");
    assert.equal(failed.choicesState, "empty");
    assert.equal(failed.finishReason, "unknown");
  });

  it("detects reasoning and tool items by shape only", async () => {
    const observation = await inspectSafeProviderResponse(response({
      object: "response",
      output: [
        { content: "hidden", id: "reasoning", type: "reasoning" },
        { arguments: "{}", call_id: "call", name: "unsafe", type: "function_call" },
      ],
      status: "completed",
    }));

    assert.equal(observation.reasoningPresent, true);
    assert.equal(observation.toolCallsPresent, true);
    assert.equal(observation.contentState, "missing");
  });

  it("uses text.format JSON Schema through the installed LangChain adapter", async () => {
    const schema = z.object({ value: z.string() }).strict();
    const config = createModelConfig({
      apiKey: "sk-synthetic-test-only",
      baseURL: "https://api.deepseek.com/v1",
      apiProtocol: "responses",
      maxRetries: 0,
      model: "deepseek-v4-flash",
      provider: "deepseek",
      timeoutMs: 1_000,
    });
    if (isModelError(config)) throw new Error(config.safeMessage);

    let requestUrl = "";
    let requestBody: Record<string, unknown> = {};
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input);
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return response(responsesEnvelope(JSON.stringify({ value: "ok" })));
    };

    try {
      const result = await invokeStructured({
        maxSchemaRetries: 0,
        maxTransportRetries: 0,
        messages: [
          { content: "Return JSON.", role: "system" },
          { content: "Synthetic input.", role: "user" },
        ],
        modelConfig: config,
        schema,
        schemaName: "SyntheticResponse",
      });

      assert.deepEqual(result, {
        data: { value: "ok" },
        model: "deepseek-v4-flash",
        ok: true,
        provider: "deepseek",
      });
      assert.equal(requestUrl, "https://api.deepseek.com/responses");
      assert.equal(
        ((requestBody.text as { format?: { type?: unknown } } | undefined)
          ?.format?.type),
        "json_schema",
      );
      assert.equal(
        ((requestBody.text as { format?: { strict?: unknown } } | undefined)
          ?.format?.strict),
        true,
      );
      assert.equal(requestBody.tools, undefined);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  it("rejects a valid-looking payload when Responses reports incomplete", async () => {
    const schema = z.object({ value: z.string() }).strict();
    const config = createModelConfig({
      apiKey: "sk-synthetic-test-only",
      apiProtocol: "responses",
      baseURL: "https://provider.invalid",
      maxRetries: 0,
      model: "deepseek-v4-flash",
      provider: "deepseek",
      timeoutMs: 1_000,
    });
    if (isModelError(config)) throw new Error(config.safeMessage);

    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => response(
      responsesEnvelope(JSON.stringify({ value: "partial" }), "incomplete"),
    );
    try {
      const result = await invokeStructured({
        maxSchemaRetries: 0,
        maxTransportRetries: 0,
        messages: [{ content: "Return JSON.", role: "user" }],
        modelConfig: config,
        schema,
        schemaName: "SyntheticResponse",
      });

      assert.equal(result.ok, false);
      if (result.ok) throw new Error("expected failure");
      assert.equal(
        result.error.structuredOutput?.protocolFailure,
        "provider_truncated",
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
