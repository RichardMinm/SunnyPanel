/**
 * Real OpenAI-compatible envelope contracts for the prompt_json path.
 *
 * These tests replace fetch with synthetic Responses, but keep the installed
 * OpenAI SDK, LangChain ChatOpenAI adapter, invokeStructured(), JSON parser,
 * and Zod validation in the call path. No network or database is used.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { invokeStructured } from "../../../src/lib/agent/llm/invoke-structured";
import { createModelConfig } from "../../../src/lib/agent/llm/model-config";
import { isModelError } from "../../../src/lib/agent/llm/model-errors";
import {
  orchestratorOutputBaseSchema,
  orchestratorOutputSchema,
} from "../../../src/lib/agent/llm/schemas/orchestrator-output";

type ExpectedProtocolFailure =
  | "provider_adapter_normalization_failed"
  | "provider_base_schema_failed"
  | "provider_empty_completion"
  | "provider_finish_reason_unexpected"
  | "provider_json_extraction_failed"
  | "provider_json_parse_failed"
  | "provider_missing_content"
  | "provider_reasoning_only"
  | "provider_response_envelope_invalid"
  | "provider_strict_schema_failed"
  | "provider_tool_arguments_only"
  | "provider_truncated";

type SafeRequestSummary = Readonly<{
  maxTokens: null | number;
  responseFormat: null | string;
  stream: boolean;
  thinking: null | string;
  toolsPresent: boolean;
}>;

type ExpectedSafeDiagnostics = Readonly<{
  contentState: "empty" | "missing" | "not_available" | "present";
  finishReason: "content_filter" | "length" | "stop" | "tool_calls" | "unknown" | null;
  parserSubstage:
    | "base_schema"
    | "content_extraction"
    | "json_extraction"
    | "json_parse"
    | "not_started"
    | "strict_schema";
  responseReceived: boolean;
  strictSchemaReached: boolean;
}>;

type StructuredFailureView = Readonly<{
  protocolFailure?: ExpectedProtocolFailure;
  safeProtocol?: Partial<ExpectedSafeDiagnostics>;
}>;

const VALID_OUTPUT = Object.freeze({
  decisionCode: "pure_read_query",
  mode: "single",
  routingSummary: "查询计划进度",
  tasks: [
    {
      agentRole: "query",
      args: {},
      dependsOn: [],
      id: "t1",
      intent: "query_progress",
      label: "查询当前进度",
    },
  ],
  version: 2,
});

const SYNTHETIC_MESSAGES = [
  { role: "system" as const, content: "Return one JSON object." },
  { role: "user" as const, content: "Synthetic workspace context." },
  { role: "user" as const, content: "Synthetic request." },
];

const makeConfig = (overrides: { timeoutMs?: number } = {}) => {
  const config = createModelConfig({
    apiKey: "sk-synthetic-test-only",
    baseURL: "https://provider.invalid",
    maxOutputTokens: 4096,
    maxRetries: 0,
    model: "deepseek-v4-pro",
    provider: "deepseek",
    structuredOutputMode: "provider_default",
    temperature: 0.1,
    thinkingMode: "disabled",
    timeoutMs: overrides.timeoutMs ?? 1_000,
  });
  if (isModelError(config)) throw new Error(config.safeMessage);
  return config;
};

const completionEnvelope = (params: {
  content?: unknown;
  finishReason?: string;
  includeContent?: boolean;
  reasoningContent?: unknown;
  toolCalls?: unknown;
}) => ({
  choices: [
    {
      finish_reason: params.finishReason ?? "stop",
      index: 0,
      message: {
        ...(params.includeContent === false
          ? {}
          : {
              content: Object.prototype.hasOwnProperty.call(params, "content")
                ? params.content
                : JSON.stringify(VALID_OUTPUT),
            }),
        ...(params.reasoningContent === undefined
          ? {}
          : { reasoning_content: params.reasoningContent }),
        role: "assistant",
        ...(params.toolCalls === undefined ? {} : { tool_calls: params.toolCalls }),
      },
    },
  ],
  created: 1,
  id: "chatcmpl-synthetic",
  model: "deepseek-v4-pro",
  object: "chat.completion",
  usage: { completion_tokens: 10, prompt_tokens: 10, total_tokens: 20 },
});

const responseFor = (
  body: unknown,
  status = 200,
): Response => new Response(JSON.stringify(body), {
  headers: { "content-type": "application/json" },
  status,
});

const deriveSafeRequestSummary = (init?: RequestInit): SafeRequestSummary => {
  const body = typeof init?.body === "string"
    ? JSON.parse(init.body) as Record<string, unknown>
    : {};
  const responseFormat = body.response_format;
  const thinking = body.thinking;
  return Object.freeze({
    maxTokens: typeof body.max_tokens === "number" ? body.max_tokens : null,
    responseFormat:
      typeof responseFormat === "object"
      && responseFormat !== null
      && typeof (responseFormat as Record<string, unknown>).type === "string"
        ? String((responseFormat as Record<string, unknown>).type)
        : null,
    stream: body.stream === true,
    thinking:
      typeof thinking === "object"
      && thinking !== null
      && typeof (thinking as Record<string, unknown>).type === "string"
        ? String((thinking as Record<string, unknown>).type)
        : null,
    toolsPresent: Array.isArray(body.tools) && body.tools.length > 0,
  });
};

const withSyntheticFetch = async <T>(
  fakeFetch: typeof fetch,
  run: () => Promise<T>,
): Promise<T> => {
  const previous = globalThis.fetch;
  globalThis.fetch = fakeFetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = previous;
  }
};

const invokeEnvelope = async (
  fakeFetch: typeof fetch,
  options: { maxTransportRetries?: number; timeoutMs?: number } = {},
) => {
  const events: unknown[] = [];
  const result = await withSyntheticFetch(fakeFetch, () => invokeStructured({
    maxSchemaRetries: 0,
    maxTransportRetries: options.maxTransportRetries ?? 0,
    messages: SYNTHETIC_MESSAGES,
    modelConfig: makeConfig(options),
    modelSchema: orchestratorOutputBaseSchema,
    providerAttemptObserver: (event) => events.push(event),
    schema: orchestratorOutputSchema,
    schemaName: "OrchestratorOutput",
  }));
  return { events, result };
};

const getFailureView = (
  result: Awaited<ReturnType<typeof invokeStructured>>,
): StructuredFailureView => {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("Expected structured failure");
  return (result.error.structuredOutput ?? {}) as StructuredFailureView;
};

const assertSafeProtocolFailure = (
  result: Awaited<ReturnType<typeof invokeStructured>>,
  expectedUpperCode: string,
  expectedSubtype: ExpectedProtocolFailure,
  expected: ExpectedSafeDiagnostics,
) => {
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, expectedUpperCode);
  const failure = getFailureView(result);
  assert.equal(failure.protocolFailure, expectedSubtype);
  assert.ok(
    failure.safeProtocol,
    "safe protocol diagnostics must be attached without payload values",
  );
  assert.equal(failure.safeProtocol?.responseReceived, expected.responseReceived);
  assert.equal(failure.safeProtocol?.contentState, expected.contentState);
  assert.equal(failure.safeProtocol?.finishReason, expected.finishReason);
  assert.equal(failure.safeProtocol?.parserSubstage, expected.parserSubstage);
  assert.equal(failure.safeProtocol?.strictSchemaReached, expected.strictSchemaReached);
  const serialized = JSON.stringify(failure);
  for (const forbidden of [
    "rawPrompt",
    "rawResponse",
    "rawContent",
    "rawReasoning",
    "toolArguments",
    "authorization",
    "cookie",
    "apiKey",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
};

describe("invokeStructured real Provider envelope contract", () => {
  const successCases = [
    {
      body: completionEnvelope({ content: JSON.stringify(VALID_OUTPUT) }),
      name: "accepts a complete plain JSON object",
    },
    {
      body: completionEnvelope({
        content: `\`\`\`json\n${JSON.stringify(VALID_OUTPUT)}\n\`\`\``,
      }),
      name: "accepts one complete Markdown fenced JSON object",
    },
    {
      body: completionEnvelope({
        content: JSON.stringify(VALID_OUTPUT),
        reasoningContent: "synthetic reasoning that must not be retained",
      }),
      name: "ignores reasoning_content when final content is valid",
    },
    {
      body: completionEnvelope({
        content: JSON.stringify({
          ...VALID_OUTPUT,
          routingSummary: "查询中文进度 ✓",
        }),
        finishReason: "stop",
      }),
      name: "accepts Unicode content and finish_reason stop",
    },
  ] as const;

  for (const scenario of successCases) {
    it(scenario.name, async () => {
      const { events, result } = await invokeEnvelope(async () =>
        responseFor(scenario.body));
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.data.version, 2);
      const phases = events.map((event) =>
        (event as { phase?: unknown }).phase).filter(Boolean);
      assert.deepEqual(phases, [
        "providerRequestStarted",
        "providerResponseReceived",
        "contentExtracted",
        "jsonParsed",
        "baseSchemaValidated",
        "strictSchemaValidated",
      ]);
      assert.equal(
        JSON.stringify({ events, result }).includes(
          "synthetic reasoning that must not be retained",
        ),
        false,
      );
    });
  }

  it("sends the frozen safe DeepSeek JSON request contract", async () => {
    let summary: SafeRequestSummary | null = null;
    const { result } = await invokeEnvelope(async (_input, init) => {
      summary = deriveSafeRequestSummary(init);
      return responseFor(completionEnvelope({}));
    });
    assert.equal(result.ok, true);
    assert.deepEqual(summary, {
      maxTokens: 4096,
      responseFormat: "json_object",
      stream: false,
      thinking: "disabled",
      toolsPresent: false,
    });
  });

  const protocolFailures: readonly {
    body: unknown;
    diagnostics: ExpectedSafeDiagnostics;
    name: string;
    subtype: ExpectedProtocolFailure;
  }[] = [
    {
      body: completionEnvelope({ content: "" }),
      diagnostics: {
        contentState: "empty",
        finishReason: "stop",
        parserSubstage: "content_extraction",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies empty completion",
      subtype: "provider_empty_completion",
    },
    {
      body: completionEnvelope({ includeContent: false }),
      diagnostics: {
        contentState: "missing",
        finishReason: "stop",
        parserSubstage: "content_extraction",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies missing content",
      subtype: "provider_missing_content",
    },
    {
      body: { ...completionEnvelope({}), choices: [] },
      diagnostics: {
        contentState: "not_available",
        finishReason: null,
        parserSubstage: "not_started",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies empty choices as invalid envelope",
      subtype: "provider_response_envelope_invalid",
    },
    {
      body: completionEnvelope({
        content: "",
        reasoningContent: "synthetic reasoning only",
      }),
      diagnostics: {
        contentState: "empty",
        finishReason: "stop",
        parserSubstage: "content_extraction",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies reasoning-only response",
      subtype: "provider_reasoning_only",
    },
    {
      body: completionEnvelope({
        content: null,
        reasoningContent: "synthetic reasoning only with null content",
      }),
      diagnostics: {
        contentState: "missing",
        finishReason: "stop",
        parserSubstage: "content_extraction",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies reasoning-only response with null content",
      subtype: "provider_reasoning_only",
    },
    {
      body: completionEnvelope({
        content: "",
        finishReason: "tool_calls",
        toolCalls: [{
          function: { arguments: JSON.stringify(VALID_OUTPUT), name: "emit" },
          id: "call-synthetic",
          type: "function",
        }],
      }),
      diagnostics: {
        contentState: "empty",
        finishReason: "tool_calls",
        parserSubstage: "content_extraction",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies tool-arguments-only response",
      subtype: "provider_tool_arguments_only",
    },
    {
      body: completionEnvelope({
        content: null,
        finishReason: "tool_calls",
        toolCalls: [{
          function: { arguments: "synthetic tool arguments", name: "emit" },
          id: "call-synthetic-null-content",
          type: "function",
        }],
      }),
      diagnostics: {
        contentState: "missing",
        finishReason: "tool_calls",
        parserSubstage: "content_extraction",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies tool-arguments-only response with null content",
      subtype: "provider_tool_arguments_only",
    },
    {
      body: completionEnvelope({ content: "not-json" }),
      diagnostics: {
        contentState: "present",
        finishReason: "stop",
        parserSubstage: "json_extraction",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies JSON extraction failure",
      subtype: "provider_json_extraction_failed",
    },
    {
      body: completionEnvelope({ content: "{\"version\":2,}" }),
      diagnostics: {
        contentState: "present",
        finishReason: "stop",
        parserSubstage: "json_parse",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies malformed JSON parse failure",
      subtype: "provider_json_parse_failed",
    },
    {
      body: completionEnvelope({
        content: JSON.stringify(VALID_OUTPUT).slice(0, -4),
        finishReason: "length",
      }),
      diagnostics: {
        contentState: "present",
        finishReason: "length",
        parserSubstage: "content_extraction",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies truncated length completion",
      subtype: "provider_truncated",
    },
    {
      body: completionEnvelope({
        content: JSON.stringify({
          ...VALID_OUTPUT,
          tasks: VALID_OUTPUT.tasks.map((task) => ({
            args: task.args,
            dependsOn: task.dependsOn,
            id: task.id,
            intent: task.intent,
            label: task.label,
          })),
        }),
      }),
      diagnostics: {
        contentState: "present",
        finishReason: "stop",
        parserSubstage: "base_schema",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies missing required field",
      subtype: "provider_base_schema_failed",
    },
    {
      body: completionEnvelope({
        content: JSON.stringify({ ...VALID_OUTPUT, version: "2" }),
      }),
      diagnostics: {
        contentState: "present",
        finishReason: "stop",
        parserSubstage: "base_schema",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies wrong field type",
      subtype: "provider_base_schema_failed",
    },
    {
      body: completionEnvelope({
        content: JSON.stringify({ ...VALID_OUTPUT, decisionCode: "unknown" }),
      }),
      diagnostics: {
        contentState: "present",
        finishReason: "stop",
        parserSubstage: "base_schema",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies unknown enum",
      subtype: "provider_base_schema_failed",
    },
    {
      body: completionEnvelope({
        content: JSON.stringify({ ...VALID_OUTPUT, extra: "must be rejected" }),
      }),
      diagnostics: {
        contentState: "present",
        finishReason: "stop",
        parserSubstage: "strict_schema",
        responseReceived: true,
        strictSchemaReached: true,
      },
      name: "rejects an extra field against the original parsed object",
      subtype: "provider_strict_schema_failed",
    },
    {
      body: { unexpected: true },
      diagnostics: {
        contentState: "not_available",
        finishReason: null,
        parserSubstage: "not_started",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies invalid response envelope",
      subtype: "provider_response_envelope_invalid",
    },
    {
      body: completionEnvelope({
        content: JSON.stringify(VALID_OUTPUT),
        finishReason: "content_filter",
      }),
      diagnostics: {
        contentState: "present",
        finishReason: "content_filter",
        parserSubstage: "content_extraction",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies unexpected finish reason",
      subtype: "provider_finish_reason_unexpected",
    },
    {
      body: completionEnvelope({
        content: [{ text: JSON.stringify(VALID_OUTPUT), type: "text" }],
      }),
      diagnostics: {
        contentState: "present",
        finishReason: "stop",
        parserSubstage: "content_extraction",
        responseReceived: true,
        strictSchemaReached: false,
      },
      name: "classifies unsupported adapter-normalized content",
      subtype: "provider_adapter_normalization_failed",
    },
  ];

  for (const scenario of protocolFailures) {
    it(scenario.name, async () => {
      const { events, result } = await invokeEnvelope(async () =>
        responseFor(scenario.body));
      assertSafeProtocolFailure(
        result,
        "STRUCTURED_OUTPUT_RETRY_EXHAUSTED",
        scenario.subtype,
        scenario.diagnostics,
      );
      const serialized = JSON.stringify({ events, result });
      for (const sentinel of [
        "synthetic reasoning only",
        "synthetic reasoning only with null content",
        "synthetic tool arguments",
        "call-synthetic",
      ]) {
        assert.equal(serialized.includes(sentinel), false);
      }
    });
  }

  const httpCases = [
    { expectedCode: "MODEL_UNAVAILABLE", name: "HTTP 400", status: 400 },
    { expectedCode: "MODEL_AUTH_FAILED", name: "HTTP 401", status: 401 },
    { expectedCode: "MODEL_AUTH_FAILED", name: "HTTP 403", status: 403 },
    { expectedCode: "MODEL_RATE_LIMITED", name: "HTTP 429", status: 429 },
    { expectedCode: "MODEL_UNAVAILABLE", name: "HTTP 500", status: 500 },
  ] as const;

  for (const scenario of httpCases) {
    it(`preserves safe diagnostics for ${scenario.name}`, async () => {
      const { events, result } = await invokeEnvelope(async () => responseFor(
        { error: { type: "synthetic_error" } },
        scenario.status,
      ));
      assert.equal(result.ok, false);
      if (result.ok) return;
      assert.equal(result.error.code, scenario.expectedCode);
      const failure = getFailureView(result);
      assert.equal(failure.safeProtocol?.responseReceived, true);
      assert.equal(
        JSON.stringify({ events, result }).includes("synthetic_error"),
        false,
      );
    });
  }

  it("classifies an aborted request as a model timeout", async () => {
    const neverCompletes: typeof fetch = async (_input, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Timeout", "TimeoutError"));
        }, { once: true });
      });
    const { result } = await invokeEnvelope(neverCompletes, { timeoutMs: 20 });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "MODEL_TIMEOUT");
  });

  it("retries an SDK-wrapped ECONNRESET without retaining its cause", async () => {
    let calls = 0;
    const sentinel = "SYNTHETIC_WRAPPED_CONNECTION_CAUSE";
    const { events, result } = await invokeEnvelope(async () => {
      calls += 1;
      if (calls === 1) {
        throw Object.assign(new Error(sentinel), { code: "ECONNRESET" });
      }
      return responseFor(completionEnvelope({}));
    }, { maxTransportRetries: 1 });

    assert.equal(result.ok, true);
    assert.equal(calls, 2);
    assert.equal(JSON.stringify({ events, result }).includes(sentinel), false);
  });

  it("classifies an SDK-wrapped TimeoutError without retaining its cause", async () => {
    const sentinel = "SYNTHETIC_WRAPPED_TIMEOUT_CAUSE";
    const { events, result } = await invokeEnvelope(async () => {
      const error = new Error(sentinel);
      error.name = "TimeoutError";
      throw error;
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "MODEL_TIMEOUT");
    assert.equal(JSON.stringify({ events, result }).includes(sentinel), false);
  });
});
