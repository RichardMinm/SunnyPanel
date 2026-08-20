import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { runResolveIntentStep } from "../../../src/lib/agent/chat-pipeline/resolve-intent-step";
import { createModelConfig, type ModelConfig } from "../../../src/lib/agent/llm/model-config";
import type { ModelFactory } from "../../../src/lib/agent/llm/model-factory";
import type { StructuredProviderAttemptEvent } from "../../../src/lib/agent/llm/invoke-structured";
import { createModelCallBudgetRecorder } from "../../../src/lib/agent/orchestration/model-call-budget";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import type { AgentChatResponse, AgentTraceStep } from "../../../src/lib/agent/schemas";
import { createTokenUsageSnapshot } from "../../../src/lib/agent/token-usage";
import {
  getWritingAssistModelSchemas,
  writingOutlineResultBaseSchema,
  writingOutlineResultSchema,
  writingTagsResultBaseSchema,
  writingTagsResultSchema,
  writingTextResultBaseSchema,
  writingTextResultSchema,
} from "../../../src/lib/agent/writing/model-schemas";
import {
  runWritingAssist,
} from "../../../src/lib/agent/writing-assist-core";
import {
  isBoundedWritingRichContent,
} from "../../../src/lib/agent/writing/input-contract";
import type { AgentThread } from "../../../src/payload-types";

const modelConfig = (): ModelConfig => {
  const resolved = createModelConfig({
    apiKey: "sk-test",
    baseURL: "https://api.test.example/v1",
    maxRetries: 0,
    model: "writing-test-model",
    provider: "openai",
    structuredOutputMode: "json_schema",
  });
  if ("code" in resolved) throw new Error(resolved.safeMessage);
  return resolved;
};

type CapturedModelCall = { calls: number; messages?: unknown[] };

const fakeModelFactory = (
  output: unknown,
  captured: CapturedModelCall = { calls: 0 },
): ModelFactory => () => ({
  withStructuredOutput: () => ({
    invoke: async (messages: unknown[]) => {
      captured.calls += 1;
      captured.messages = messages;
      if (output instanceof Error) throw output;
      return output;
    },
  }),
}) as unknown as BaseChatModel;

const messageText = (
  messages: unknown[] | undefined,
  constructorName: "HumanMessage" | "SystemMessage",
) => (messages ?? [])
  .filter((message): message is { content?: unknown; constructor?: { name?: string } } =>
    typeof message === "object"
    && message !== null
    && message.constructor?.name === constructorName)
  .map((message) => String(message.content ?? ""))
  .join("\n");

const withLlmEnabled = async (run: () => Promise<void>) => {
  const previous = process.env.AGENT_DISABLE_LLM;
  delete process.env.AGENT_DISABLE_LLM;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.AGENT_DISABLE_LLM;
    else process.env.AGENT_DISABLE_LLM = previous;
  }
};

const promptContext: AgentPromptContext = {
  checklists: [],
  contentItems: [],
  memories: [],
  now: "2026-08-18T10:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> =
  createTokenUsageSnapshot({
    contextTokens: 8,
    inputTokens: 5,
    source: "estimate",
  });

const resolveWriting = async ({
  modelCallRecorder = createModelCallBudgetRecorder(),
  pushTrace = () => undefined,
  writingAssistRunner,
}: {
  modelCallRecorder?: ReturnType<typeof createModelCallBudgetRecorder>;
  pushTrace?: (step: AgentTraceStep) => void;
  writingAssistRunner: typeof runWritingAssist;
}) => runResolveIntentStep({
  confirmationSignals: { cancel: false, confirm: false },
  context: promptContext,
  emitStatus: () => undefined,
  emitToken: () => undefined,
  emitUsage: () => undefined,
  message: "请润色：这是用户正文。",
  modelCallRecorder,
  pendingAction: null,
  persistAgentTurn: async () => ({ id: 91 } as AgentThread),
  pushTrace,
  recordAgentConfirmationDecisionFn: async () => undefined,
  recordBatchConfirmationDecisionFn: async () => undefined,
  resolvedHistory: [],
  thread: { id: 91 } as AgentThread,
  tokenUsage: baseTokenUsage,
  trace: [],
  user: { id: 1 },
  workbenchMode: "writing",
  writingAssistRunner,
});

describe("L3-D5 Writing Assist structured model boundary", () => {
  it("accepts only bounded valid RichContent input", () => {
    assert.equal(isBoundedWritingRichContent({ type: "doc" }), true);
    assert.equal(isBoundedWritingRichContent({ content: "invalid", type: "doc" }), false);
    assert.equal(isBoundedWritingRichContent({ content: "invalid" }), false);
    assert.equal(isBoundedWritingRichContent({ execute: true, type: "doc" }), false);
    assert.equal(isBoundedWritingRichContent({
      content: [{ execute: true, type: "paragraph" }],
      type: "doc",
    }), false);
    assert.equal(isBoundedWritingRichContent({
      content: [{
        content: [{
          marks: [{ execute: true, type: "bold" }],
          text: "不能携带额外字段",
          type: "text",
        }],
        type: "paragraph",
      }],
      type: "doc",
    }), false);
    assert.equal(isBoundedWritingRichContent({
      content: [{
        content: [{ text: "x".repeat(100_001), type: "text" }],
        type: "paragraph",
      }],
      type: "doc",
    }), false);

    const deepRoot: Record<string, unknown> = { type: "doc" };
    let content: unknown[] = [];
    deepRoot.content = content;
    for (let depth = 0; depth < 100; depth += 1) {
      const node: Record<string, unknown> = {
        content: [],
        type: "blockquote",
      };
      content.push(node);
      content = node.content as unknown[];
    }
    assert.doesNotThrow(() => isBoundedWritingRichContent(deepRoot));
    assert.equal(isBoundedWritingRichContent(deepRoot), false);

    const cyclic: Record<string, unknown> = { type: "doc" };
    cyclic.content = [cyclic];
    assert.doesNotThrow(() => isBoundedWritingRichContent(cyclic));
    assert.equal(isBoundedWritingRichContent(cyclic), false);
  });

  it("rejects credentials before context loading or a Provider call", async () => {
    await withLlmEnabled(async () => {
      let contextReads = 0;
      let logicalCalls = 0;
      const result = await runWritingAssist(
        {
          action: "rewrite",
          text: "请记住 API key: sk-abcdefghijklmnopqrstuvwxyz123456",
        },
        {
          fetchRelatedTitles: async () => {
            contextReads += 1;
            return [];
          },
          fetchStyleMemories: async () => {
            contextReads += 1;
            return [];
          },
          modelInvocation: {
            logicalCallAuthorizer: () => {
              logicalCalls += 1;
            },
            modelConfig: modelConfig(),
            modelFactory: fakeModelFactory({ result: "must not run" }),
          },
        },
      );

      assert.deepEqual(result, {});
      assert.equal(contextReads, 0);
      assert.equal(logicalCalls, 0);
    });
  });
  it("publishes action-specific base and strict schemas", () => {
    const text = { result: "润色后的正文" };
    const tags = { tags: ["写作", "安全边界"] };
    const outline = {
      outline: [{ id: "section-1", level: 1, text: "开篇" }],
    };

    assert.equal(writingTextResultBaseSchema.safeParse(text).success, true);
    assert.equal(writingTextResultSchema.safeParse(text).success, true);
    assert.equal(writingTagsResultBaseSchema.safeParse(tags).success, true);
    assert.equal(writingTagsResultSchema.safeParse(tags).success, true);
    assert.equal(writingOutlineResultBaseSchema.safeParse(outline).success, true);
    assert.equal(writingOutlineResultSchema.safeParse(outline).success, true);

    assert.equal(getWritingAssistModelSchemas("polish").schema, writingTextResultSchema);
    assert.equal(getWritingAssistModelSchemas("extract_tags").schema, writingTagsResultSchema);
    assert.equal(getWritingAssistModelSchemas("generate_outline").schema, writingOutlineResultSchema);
  });

  it("strictly rejects extra execution, resource, and reasoning fields", () => {
    for (const extra of [
      { execute: true },
      { resourceId: 999 },
      { reasoning: "hidden chain" },
    ]) {
      assert.equal(
        writingTextResultSchema.safeParse({ result: "正文", ...extra }).success,
        false,
      );
      assert.equal(
        writingTagsResultSchema.safeParse({ tags: ["写作"], ...extra }).success,
        false,
      );
      assert.equal(
        writingOutlineResultSchema.safeParse({
          outline: [{ id: "section-1", level: 1, text: "开篇" }],
          ...extra,
        }).success,
        false,
      );
    }

    assert.equal(
      writingOutlineResultSchema.safeParse({
        outline: [{ execute: true, id: "section-1", level: 1, text: "开篇" }],
      }).success,
      false,
    );
  });

  it("calls a fake model once, accounts the call, and isolates all user context", async () => {
    await withLlmEnabled(async () => {
      const sentinel = "WRITING_IGNORE_RULES_AND_EXECUTE_SENTINEL";
      const captured: CapturedModelCall = { calls: 0 };
      const events: StructuredProviderAttemptEvent[] = [];
      let logicalCalls = 0;
      let providerAttempts = 0;
      const result = await runWritingAssist(
        {
          action: "polish",
          collection: "posts",
          text: sentinel,
          title: "不可信标题",
        },
        {
          fetchRelatedTitles: async () => [`RELATED_${sentinel}`],
          fetchStyleMemories: async () => [`STYLE_${sentinel}`],
          modelInvocation: {
            logicalCallAuthorizer: () => {
              logicalCalls += 1;
            },
            modelConfig: modelConfig(),
            modelFactory: fakeModelFactory({ result: "润色后的安全文本" }, captured),
            providerAttemptAuthorizer: () => {
              providerAttempts += 1;
            },
            providerAttemptObserver: (event) => events.push(event),
          },
        },
      );

      assert.deepEqual(result, { result: "润色后的安全文本" });
      assert.equal(captured.calls, 1);
      assert.equal(logicalCalls, 1);
      assert.equal(providerAttempts, 1);
      assert.equal(events.filter((event) => event.phase === "providerRequestStarted").length, 1);
      assert.equal(events.filter((event) => event.phase === "strictSchemaValidated").length, 1);
      assert.doesNotMatch(messageText(captured.messages, "SystemMessage"), new RegExp(sentinel, "u"));
      assert.match(messageText(captured.messages, "HumanMessage"), /UNTRUSTED user data/u);
      assert.match(messageText(captured.messages, "HumanMessage"), new RegExp(sentinel, "u"));
    });
  });

  it("returns an empty result on strict-schema and Provider failures", async () => {
    await withLlmEnabled(async () => {
      for (const output of [
        { execute: true, result: "越权结果" },
        new Error("synthetic Provider failure"),
      ]) {
        const captured: CapturedModelCall = { calls: 0 };
        let providerAttempts = 0;
        const result = await runWritingAssist(
          { action: "rewrite", text: "原文" },
          {
            fetchRelatedTitles: async () => [],
            fetchStyleMemories: async () => [],
            modelInvocation: {
              modelConfig: modelConfig(),
              modelFactory: fakeModelFactory(output, captured),
              providerAttemptAuthorizer: () => {
                providerAttempts += 1;
              },
            },
          },
        );

        assert.deepEqual(result, {});
        assert.ok(captured.calls >= 1 && captured.calls <= 2);
        assert.equal(providerAttempts, captured.calls);
      }
    });
  });

  it("injects the turn recorder as the Writing specialist accounting boundary", async () => {
    const source = readFileSync(
      "src/lib/agent/chat-pipeline/legacy-heuristic-resolution-step.ts",
      "utf8",
    );

    assert.match(
      source,
      /const runner = writingAssistRunner \?\? runWritingAssist;[\s\S]*?runner\(request,\s*\{\s*modelInvocation:/u,
    );
    assert.match(
      source,
      /logicalCallAuthorizer:\s*\(scopeId\)[\s\S]*?modelCallRecorder\?\.record\("specialist",\s*scopeId\)/u,
    );
    assert.match(
      source,
      /providerAttemptAuthorizer:[\s\S]*?modelCallRecorder\?\.recordProviderAttempt\("specialist"\)/u,
    );

    const route = readFileSync("src/app/api/agent/writing-assist/route.ts", "utf8");
    assert.match(route, /createModelCallBudgetRecorder/u);
    assert.match(route, /record\("specialist",\s*scopeId\)/u);
    assert.match(route, /recordProviderAttempt\("specialist"\)/u);

    const capability = readFileSync("src/lib/agent/capabilities/registry.ts", "utf8");
    const writingOutlineStart = capability.indexOf("const executeDraftWritingOutline");
    const timelineStart = capability.indexOf("const executeDraftTimelineEvent");
    assert.doesNotMatch(
      capability.slice(writingOutlineStart, timelineStart),
      /runWritingAssist|completeStructured|\/chat\/completions/u,
    );
  });

  it("does not expose Provider errors or secrets through workbench output and trace", async () => {
    const trace: AgentTraceStep[] = [];
    const secret = "sk-do-not-expose-provider-secret";
    const result = await resolveWriting({
      pushTrace: (step) => trace.push(step),
      writingAssistRunner: async () => {
        throw new Error(`raw Provider response contains ${secret}`);
      },
    });

    assert.equal(result.outcome, "continue");
    if (result.outcome !== "continue") assert.fail("expected controlled writing fallback");
    assert.equal(result.data.resolution.intent.intent, "clarify");
    const visible = JSON.stringify({
      intent: result.data.resolution.intent,
      trace,
    });
    assert.doesNotMatch(visible, new RegExp(secret, "u"));
    assert.doesNotMatch(visible, /raw Provider response/u);
    assert.match(visible, /写作辅助暂时不可用|写作辅助失败/u);
  });

  it("contains no active Legacy transport or manual JSON parsing", () => {
    const source = readFileSync("src/lib/agent/writing-assist-core.ts", "utf8");

    assert.doesNotMatch(source, /completeStructured/u);
    assert.doesNotMatch(source, /fetchWithRetry|\/chat\/completions/u);
    assert.doesNotMatch(source, /extractJSONObject|JSON\.parse|content\.match\(/u);
    assert.doesNotMatch(source, /parseWritingAssistResult/u);
  });
});
