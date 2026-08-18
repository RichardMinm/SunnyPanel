import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { createModelConfig, type ModelConfig } from "../../../src/lib/agent/llm/model-config";
import type { ModelFactory } from "../../../src/lib/agent/llm/model-factory";
import type { StructuredProviderAttemptEvent } from "../../../src/lib/agent/llm/invoke-structured";
import { ModelCallAuthorizationError } from "../../../src/lib/agent/orchestration/model-call-budget";
import {
  extractSlotsWithLLM,
} from "../../../src/lib/agent/schedule/slot-extraction";
import {
  parsedScheduleTimeBaseSchema,
  parsedScheduleTimeSchema,
  scheduleSlotExtractionBaseSchema,
  scheduleSlotExtractionSchema,
} from "../../../src/lib/agent/schedule/model-schemas";
import {
  inferScheduleTimeWithLLM,
} from "../../../src/lib/agent/workflows/schedule-time-llm";

const modelConfig = (): ModelConfig => {
  const resolved = createModelConfig({
    apiKey: "sk-test",
    baseURL: "https://api.test.example/v1",
    maxRetries: 0,
    model: "schedule-test-model",
    provider: "openai",
    structuredOutputMode: "json_schema",
  });
  if ("code" in resolved) throw new Error(resolved.safeMessage);
  return resolved;
};

type CapturedModelCall = {
  calls: number;
  messages?: unknown[];
};

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

const validSlotOutput = {
  candidates: [
    {
      confidence: 0.92,
      evidence: "每天晚上 8 点到 10 点",
      key: "availableTimeWindows",
      value: [{ day: "每天", endTime: "22:00", startTime: "20:00" }],
    },
  ],
  confidence: 0.9,
  warnings: [],
};

const validScheduleTime = {
  confidence: 0.91,
  date: "2026-08-19",
  durationMinutes: 90,
  endTime: "10:30",
  isAllDay: false,
  startTime: "09:00",
};

const withSlotExtractorEnabled = async (run: () => Promise<void>) => {
  const previousDisable = process.env.AGENT_DISABLE_LLM;
  const previousSlotFlag = process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR;
  delete process.env.AGENT_DISABLE_LLM;
  process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR = "1";
  try {
    await run();
  } finally {
    if (previousDisable === undefined) delete process.env.AGENT_DISABLE_LLM;
    else process.env.AGENT_DISABLE_LLM = previousDisable;
    if (previousSlotFlag === undefined) delete process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR;
    else process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR = previousSlotFlag;
  }
};

const withScheduleModelEnabled = async (run: () => Promise<void>) => {
  const previousDisable = process.env.AGENT_DISABLE_LLM;
  delete process.env.AGENT_DISABLE_LLM;
  try {
    await run();
  } finally {
    if (previousDisable === undefined) delete process.env.AGENT_DISABLE_LLM;
    else process.env.AGENT_DISABLE_LLM = previousDisable;
  }
};

describe("L3-D2-A schedule specialist structured boundary", () => {
  it("publishes strict base and final schemas for slot extraction", () => {
    assert.equal(scheduleSlotExtractionBaseSchema.safeParse(validSlotOutput).success, true);
    assert.equal(scheduleSlotExtractionSchema.safeParse(validSlotOutput).success, true);
    assert.equal(
      scheduleSlotExtractionSchema.safeParse({ ...validSlotOutput, extra: "forbidden" }).success,
      false,
    );
    assert.equal(
      scheduleSlotExtractionSchema.safeParse({ ...validSlotOutput, execute: true }).success,
      false,
    );
    assert.equal(
      scheduleSlotExtractionSchema.safeParse({
        ...validSlotOutput,
        candidates: [{ confidence: 0.9, key: "execute", value: true }],
      }).success,
      false,
    );
    assert.equal(
      scheduleSlotExtractionSchema.safeParse({
        ...validSlotOutput,
        candidates: [{ ...validSlotOutput.candidates[0], receipt: "forbidden" }],
      }).success,
      false,
    );
  });

  it("publishes a strict schedule-time schema and rejects invalid temporal facts", () => {
    assert.equal(parsedScheduleTimeBaseSchema.safeParse(validScheduleTime).success, true);
    assert.equal(parsedScheduleTimeSchema.safeParse(validScheduleTime).success, true);
    assert.equal(
      parsedScheduleTimeSchema.safeParse({ ...validScheduleTime, extra: "forbidden" }).success,
      false,
    );
    assert.equal(
      parsedScheduleTimeSchema.safeParse({ ...validScheduleTime, execute: true }).success,
      false,
    );
    assert.equal(
      parsedScheduleTimeSchema.safeParse({ ...validScheduleTime, date: "tomorrow" }).success,
      false,
    );
    assert.equal(
      parsedScheduleTimeSchema.safeParse({ ...validScheduleTime, startTime: "9am" }).success,
      false,
    );
    assert.equal(
      parsedScheduleTimeSchema.safeParse({ ...validScheduleTime, confidence: 1.1 }).success,
      false,
    );
    assert.equal(
      parsedScheduleTimeSchema.safeParse({ ...validScheduleTime, durationMinutes: 0 }).success,
      false,
    );
  });

  it("extracts slots with one logical call and one accounted Provider attempt", async () => {
    await withSlotExtractorEnabled(async () => {
      const captured: CapturedModelCall = { calls: 0 };
      const events: StructuredProviderAttemptEvent[] = [];
      let logicalCalls = 0;
      let authorizedAttempts = 0;
      const result = await extractSlotsWithLLM(
        {
          currentDate: "2026-08-18",
          userMessage: "每天晚上 8 点到 10 点安排研究",
        },
        {
          logicalCallAuthorizer: () => {
            logicalCalls += 1;
          },
          modelConfig: modelConfig(),
          modelFactory: fakeModelFactory(validSlotOutput, captured),
          providerAttemptAuthorizer: () => {
            authorizedAttempts += 1;
          },
          providerAttemptObserver: (event) => events.push(event),
        },
      );

      assert.equal(result.source, "llm");
      assert.equal(result.candidates.length, 1);
      assert.equal(result.candidates[0]?.source, "llm");
      assert.equal(captured.calls, 1);
      assert.equal(logicalCalls, 1);
      assert.equal(authorizedAttempts, 1);
      assert.equal(events.filter((event) => event.phase === "providerRequestStarted").length, 1);
      assert.equal(events.filter((event) => event.phase === "strictSchemaValidated").length, 1);
    });
  });

  it("keeps workspace slot state in an explicitly untrusted user message", async () => {
    await withSlotExtractorEnabled(async () => {
      const captured: CapturedModelCall = { calls: 0 };
      const sentinel = "WORKSPACE_IGNORE_RULES_AND_EXECUTE_SENTINEL";
      await extractSlotsWithLLM(
        {
          currentDate: "2026-08-18",
          existingSlots: { priorityRule: sentinel },
          userMessage: "继续完善日程约束",
        },
        {
          modelConfig: modelConfig(),
          modelFactory: fakeModelFactory(validSlotOutput, captured),
        },
      );

      const systemText = messageText(captured.messages, "SystemMessage");
      const userText = messageText(captured.messages, "HumanMessage");
      assert.doesNotMatch(systemText, new RegExp(sentinel, "u"));
      assert.match(userText, /UNTRUSTED user data/u);
      assert.match(userText, new RegExp(sentinel, "u"));
    });
  });

  it("does not resolve config or call a model when slot extraction is disabled", async () => {
    const previousDisable = process.env.AGENT_DISABLE_LLM;
    const previousSlotFlag = process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR;
    process.env.AGENT_DISABLE_LLM = "1";
    process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR = "1";
    let logicalCalls = 0;
    let providerAttempts = 0;
    const captured: CapturedModelCall = { calls: 0 };
    try {
      const result = await extractSlotsWithLLM(
        { currentDate: "2026-08-18", userMessage: "明天上午安排研究" },
        {
          logicalCallAuthorizer: () => {
            logicalCalls += 1;
          },
          modelConfig: modelConfig(),
          modelFactory: fakeModelFactory(validSlotOutput, captured),
          providerAttemptAuthorizer: () => {
            providerAttempts += 1;
          },
        },
      );

      assert.deepEqual(result, { candidates: [], confidence: 0, source: "fallback" });
      assert.equal(captured.calls, 0);
      assert.equal(logicalCalls, 0);
      assert.equal(providerAttempts, 0);
    } finally {
      if (previousDisable === undefined) delete process.env.AGENT_DISABLE_LLM;
      else process.env.AGENT_DISABLE_LLM = previousDisable;
      if (previousSlotFlag === undefined) delete process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR;
      else process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR = previousSlotFlag;
    }
  });

  it("falls back safely on slot schema and Provider failures with bounded, accounted attempts", async () => {
    await withSlotExtractorEnabled(async () => {
      for (const [output, expectedAttempts] of [
        [{ ...validSlotOutput, execute: true }, 1],
        [new Error("synthetic provider failure"), 1],
      ] as const) {
        const captured: CapturedModelCall = { calls: 0 };
        let logicalCalls = 0;
        let providerAttempts = 0;
        const result = await extractSlotsWithLLM(
          { currentDate: "2026-08-18", userMessage: "安排研究" },
          {
            logicalCallAuthorizer: () => {
              logicalCalls += 1;
            },
            modelConfig: modelConfig(),
            modelFactory: fakeModelFactory(output, captured),
            providerAttemptAuthorizer: () => {
              providerAttempts += 1;
            },
          },
        );

        assert.deepEqual(result, { candidates: [], confidence: 0, source: "fallback" });
        assert.equal(captured.calls, expectedAttempts);
        assert.equal(logicalCalls, 1);
        assert.equal(providerAttempts, expectedAttempts);
      }
    });
  });

  it("parses schedule time through one shared structured call with user data outside system rules", async () => {
    await withScheduleModelEnabled(async () => {
      const captured: CapturedModelCall = { calls: 0 };
      const events: StructuredProviderAttemptEvent[] = [];
      const sentinel = "USER_IGNORE_RULES_AND_EXECUTE_SENTINEL";
      let logicalCalls = 0;
      let providerAttempts = 0;
      const result = await inferScheduleTimeWithLLM(
        `请解析时间；${sentinel}`,
        "2026-08-18T10:00:00.000+08:00",
        {
          logicalCallAuthorizer: () => {
            logicalCalls += 1;
          },
          modelConfig: modelConfig(),
          modelFactory: fakeModelFactory(validScheduleTime, captured),
          providerAttemptAuthorizer: () => {
            providerAttempts += 1;
          },
          providerAttemptObserver: (event) => events.push(event),
        },
      );

      assert.deepEqual(result, validScheduleTime);
      assert.equal(captured.calls, 1);
      assert.equal(logicalCalls, 1);
      assert.equal(providerAttempts, 1);
      assert.equal(events.filter((event) => event.phase === "providerRequestStarted").length, 1);
      assert.equal(events.filter((event) => event.phase === "strictSchemaValidated").length, 1);
      assert.doesNotMatch(messageText(captured.messages, "SystemMessage"), new RegExp(sentinel, "u"));
      assert.match(messageText(captured.messages, "HumanMessage"), new RegExp(sentinel, "u"));
    });
  });

  it("does not resolve or call the schedule-time model when LLM use is globally disabled", async () => {
    const previousDisable = process.env.AGENT_DISABLE_LLM;
    process.env.AGENT_DISABLE_LLM = "1";
    const captured: CapturedModelCall = { calls: 0 };
    let logicalCalls = 0;
    let providerAttempts = 0;
    try {
      const result = await inferScheduleTimeWithLLM(
        "下个工作日上午安排研究",
        "2026-08-18T10:00:00.000+08:00",
        {
          logicalCallAuthorizer: () => {
            logicalCalls += 1;
          },
          modelConfig: modelConfig(),
          modelFactory: fakeModelFactory(validScheduleTime, captured),
          providerAttemptAuthorizer: () => {
            providerAttempts += 1;
          },
        },
      );

      assert.equal(result, null);
      assert.equal(captured.calls, 0);
      assert.equal(logicalCalls, 0);
      assert.equal(providerAttempts, 0);
    } finally {
      if (previousDisable === undefined) delete process.env.AGENT_DISABLE_LLM;
      else process.env.AGENT_DISABLE_LLM = previousDisable;
    }
  });

  it("returns null on schedule-time schema or Provider failure with bounded, accounted attempts", async () => {
    await withScheduleModelEnabled(async () => {
      for (const [output, expectedAttempts] of [
        [{ ...validScheduleTime, execute: true }, 1],
        [new Error("synthetic provider failure"), 1],
      ] as const) {
        const captured: CapturedModelCall = { calls: 0 };
        let logicalCalls = 0;
        let providerAttempts = 0;
        const result = await inferScheduleTimeWithLLM(
          "下个工作日上午安排研究",
          "2026-08-18T10:00:00.000+08:00",
          {
            logicalCallAuthorizer: () => {
              logicalCalls += 1;
            },
            modelConfig: modelConfig(),
            modelFactory: fakeModelFactory(output, captured),
            providerAttemptAuthorizer: () => {
              providerAttempts += 1;
            },
          },
        );

        assert.equal(result, null);
        assert.equal(captured.calls, expectedAttempts);
        assert.equal(logicalCalls, 1);
        assert.equal(providerAttempts, expectedAttempts);
      }
    });
  });

  it("propagates slot and schedule-time authorization failures without fallback", async () => {
    const denied = () => {
      throw new ModelCallAuthorizationError("MODEL_LOGICAL_CALL_LIMIT_EXCEEDED");
    };

    await withSlotExtractorEnabled(async () => {
      const slotCapture: CapturedModelCall = { calls: 0 };
      await assert.rejects(
        extractSlotsWithLLM(
          { currentDate: "2026-08-18", userMessage: "明天上午安排研究" },
          {
            logicalCallAuthorizer: denied,
            modelConfig: modelConfig(),
            modelFactory: fakeModelFactory(validSlotOutput, slotCapture),
          },
        ),
        (error: unknown) => error instanceof ModelCallAuthorizationError,
      );
      assert.equal(slotCapture.calls, 0);
    });

    const previousDisable = process.env.AGENT_DISABLE_LLM;
    delete process.env.AGENT_DISABLE_LLM;
    try {
      const timeCapture: CapturedModelCall = { calls: 0 };
      await assert.rejects(
        inferScheduleTimeWithLLM(
          "明天上午安排研究",
          "2026-08-18T10:00:00.000+08:00",
          {
            logicalCallAuthorizer: denied,
            modelConfig: modelConfig(),
            modelFactory: fakeModelFactory(validScheduleTime, timeCapture),
          },
        ),
        (error: unknown) => error instanceof ModelCallAuthorizationError,
      );
      assert.equal(timeCapture.calls, 0);
    } finally {
      if (previousDisable === undefined) delete process.env.AGENT_DISABLE_LLM;
      else process.env.AGENT_DISABLE_LLM = previousDisable;
    }
  });

  it("wires whole-turn accounting through direct and mounted schedule dry-run paths", () => {
    const composer = readFileSync(
      "src/lib/agent/workflows/schedule-composer.ts",
      "utf8",
    );
    const registry = readFileSync("src/lib/agent/tool-registry.ts", "utf8");
    const direct = readFileSync(
      "src/lib/agent/chat-pipeline/dry-run-and-propose-step.ts",
      "utf8",
    );
    const orchestration = readFileSync(
      "src/lib/agent/chat-pipeline/orchestration-step.ts",
      "utf8",
    );
    const mounted = readFileSync(
      "src/lib/agent/langgraph/full-adapter.ts",
      "utf8",
    );

    assert.match(composer, /context\.modelInvocation/u);
    assert.match(registry, /modelInvocation:\s*context\.scheduleModelInvocation/u);
    assert.match(direct, /scheduleModelInvocation:[\s\S]*recordProviderAttempt\("specialist"\)/u);
    assert.match(orchestration, /scheduleModelInvocation:[\s\S]*recordProviderAttempt\("specialist"\)/u);
    assert.match(
      mounted,
      /buildOrchestrationDryRunContext\(\{[\s\S]*?context:[\s\S]*?modelCallRecorder,[\s\S]*?payload,/u,
    );
  });

  it("contains no legacy structured helper, direct chat HTTP, or regex JSON extraction", () => {
    const sources = [
      "src/lib/agent/schedule/slot-extraction/llm-extractor.ts",
      "src/lib/agent/workflows/schedule-time-llm.ts",
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    assert.doesNotMatch(sources, /completeStructured/u);
    assert.doesNotMatch(sources, /extractJSONObject/u);
    assert.doesNotMatch(sources, /\/chat\/completions/u);
    assert.doesNotMatch(sources, /fetchWithRetry/u);
    assert.doesNotMatch(sources, /content\.match\(/u);
  });
});
