import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import { createModelConfig, type ModelConfig } from "../../../src/lib/agent/llm/model-config";
import type { ModelFactory } from "../../../src/lib/agent/llm/model-factory";
import type { StructuredProviderAttemptEvent } from "../../../src/lib/agent/llm/invoke-structured";
import { ModelCallAuthorizationError } from "../../../src/lib/agent/orchestration/model-call-budget";
import {
  createIntentFromProposedAction,
  dryRunAgentIntent,
} from "../../../src/lib/agent/safety";
import {
  formatFrozenScheduleItemTitle,
  frozenSchedulePlanProposalSchema,
  planScheduleDraftBaseSchema,
  planScheduleDraftSchema,
  type FrozenSchedulePlanProposal,
  type PlanScheduleDraft,
} from "../../../src/lib/agent/schedule/model-schemas";
import { executeAgentTool } from "../../../src/lib/agent/tool-registry";
import { parsePendingAction } from "../../../src/lib/agent/schemas";
import { schedulePlanFromIntent } from "../../../src/lib/agent/tools/schedule-mutate";
import type { DecomposedPhase } from "../../../src/lib/agent/workflows/plan-decomposer";
import {
  buildSchedulePlanSourceFingerprint,
  isFrozenSchedulePlanProposalCurrentlySafe,
  persistFrozenSchedulePlanProposal,
  runSchedulePlanPersistenceTransaction,
  SchedulePlanPersistenceIndeterminateError,
} from "../../../src/lib/agent/workflows/plan-schedule-link";
import {
  buildPlanScheduleMessages,
  buildPlanScheduleTaskManifest,
  materializePlanScheduleDraft,
  planSmartScheduleWithLLM,
  type PlanScheduleDraftInput,
} from "../../../src/lib/agent/workflows/plan-schedule-llm";

const modelConfig = (): ModelConfig => {
  const resolved = createModelConfig({
    apiKey: "sk-test",
    baseURL: "https://api.test.example/v1",
    maxRetries: 0,
    model: "schedule-plan-test-model",
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

const messageRoleText = (
  messages: unknown[],
  role: "system" | "user",
) => messages
  .filter((message): message is { content?: unknown; role?: unknown } =>
    typeof message === "object"
    && message !== null
    && "role" in message
    && message.role === role)
  .map((message) => String(message.content ?? ""))
  .join("\n");

const phases: DecomposedPhase[] = [
  {
    estimatedDays: 3,
    goal: "完成可信研究",
    milestones: [
      {
        estimatedHours: 4,
        tasks: ["复现漏洞", "整理结论"],
        title: "研究里程碑",
      },
    ],
    title: "研究阶段",
  },
];
const planFingerprint = "a".repeat(64);

const input = (overrides: Partial<PlanScheduleDraftInput> = {}): PlanScheduleDraftInput => ({
  occupiedSlots: [
    {
      date: "2026-08-19",
      endTime: "10:00",
      isAllDay: false,
      startTime: "09:00",
      title: "已有日程",
    },
  ],
  options: {
    defaultDurationMinutes: 90,
    defaultStartTime: "09:00",
    startDate: "2026-08-18",
  },
  phases,
  planFingerprint,
  planId: 101,
  planPriority: "high",
  planTitle: "Fastjson 研究计划",
  ...overrides,
});

const validDraft: PlanScheduleDraft = {
  items: [
    {
      date: "2026-08-19",
      endTime: "11:30",
      isAllDay: false,
      startTime: "10:00",
      taskKey: "task-001",
    },
    {
      date: "2026-08-20",
      endTime: "10:30",
      isAllDay: false,
      startTime: "09:00",
      taskKey: "task-002",
    },
  ],
};

const frozenProposal = (): FrozenSchedulePlanProposal => {
  const proposal = materializePlanScheduleDraft({
    draft: validDraft,
    input: input(),
    source: "model",
  });
  if (!proposal) throw new Error("expected a valid frozen schedule proposal");
  return proposal;
};

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

describe("L3-D2-B frozen schedule-plan proposal", () => {
  it("limits model output to taskKey and temporal assignment fields", () => {
    assert.equal(planScheduleDraftBaseSchema.safeParse(validDraft).success, true);
    assert.equal(planScheduleDraftSchema.safeParse(validDraft).success, true);
    assert.equal(
      planScheduleDraftSchema.safeParse({ ...validDraft, execute: true }).success,
      false,
    );

    for (const forbidden of [
      { title: "模型伪造标题" },
      { phaseTitle: "模型伪造阶段" },
      { planId: 999 },
      { resourceId: "resource-999" },
      { execute: true },
    ]) {
      assert.equal(
        planScheduleDraftSchema.safeParse({
          items: [{ ...validDraft.items[0], ...forbidden }],
        }).success,
        false,
      );
    }
  });

  it("derives stable task keys and trusted titles from the deterministic manifest", () => {
    assert.deepEqual(buildPlanScheduleTaskManifest(phases), [
      {
        estimatedHours: 4,
        milestoneTitle: "研究里程碑",
        phaseTitle: "研究阶段",
        taskKey: "task-001",
        title: "复现漏洞",
      },
      {
        estimatedHours: 4,
        milestoneTitle: "研究里程碑",
        phaseTitle: "研究阶段",
        taskKey: "task-002",
        title: "整理结论",
      },
    ]);
  });

  it("materializes only trusted plan metadata and titles into the frozen proposal", () => {
    const proposal = materializePlanScheduleDraft({
      draft: validDraft,
      input: input(),
      source: "model",
    });

    assert.deepEqual(proposal, {
      items: [
        {
          ...validDraft.items[0],
          phaseTitle: "研究阶段",
          title: "复现漏洞",
        },
        {
          ...validDraft.items[1],
          phaseTitle: "研究阶段",
          title: "整理结论",
        },
      ],
      planFingerprint,
      planId: 101,
      planTitle: "Fastjson 研究计划",
      source: "model",
      startDate: "2026-08-18",
    });
    assert.equal(frozenSchedulePlanProposalSchema.safeParse(proposal).success, true);
  });

  it("binds the frozen proposal to the exact deterministic plan source", async () => {
    const originalPlan = {
      id: 101,
      phases,
      priority: "high",
      title: "Fastjson 研究计划",
    };
    const proposal = {
      ...frozenProposal(),
      planFingerprint: buildSchedulePlanSourceFingerprint(originalPlan as never),
    };
    const changedPlan = {
      ...originalPlan,
      phases: [{ ...phases[0], goal: "已被用户修改" }],
    };

    assert.notEqual(
      buildSchedulePlanSourceFingerprint(originalPlan as never),
      buildSchedulePlanSourceFingerprint(changedPlan as never),
    );
    assert.equal(
      await isFrozenSchedulePlanProposalCurrentlySafe(
        proposal,
        {} as never,
        changedPlan as never,
      ),
      false,
    );
  });

  it("uses one accounted model call to produce a complete frozen proposal", async () => {
    await withLlmEnabled(async () => {
      const captured: CapturedModelCall = { calls: 0 };
      const events: StructuredProviderAttemptEvent[] = [];
      const logicalScopes: string[] = [];
      let logicalCalls = 0;
      let providerAttempts = 0;
      const proposal = await planSmartScheduleWithLLM(input(), {
        logicalCallAuthorizer: (scopeId) => {
          logicalScopes.push(scopeId);
          logicalCalls += 1;
        },
        modelConfig: modelConfig(),
        modelFactory: fakeModelFactory(validDraft, captured),
        providerAttemptAuthorizer: () => {
          providerAttempts += 1;
        },
        providerAttemptObserver: (event) => events.push(event),
      });

      assert.equal(proposal?.items[0]?.title, "复现漏洞");
      assert.equal(proposal?.items[0]?.phaseTitle, "研究阶段");
      assert.equal(proposal?.planId, 101);
      assert.equal(captured.calls, 1);
      assert.equal(logicalCalls, 1);
      assert.match(logicalScopes[0] ?? "", /^schedule-plan-proposal:[a-f0-9]{16}$/u);
      assert.equal(providerAttempts, 1);
      assert.equal(events.filter((event) => event.phase === "providerRequestStarted").length, 1);
      assert.equal(events.filter((event) => event.phase === "strictSchemaValidated").length, 1);
    });
  });

  it("propagates plan-schedule model authorization failures without deterministic fallback", async () => {
    await withLlmEnabled(async () => {
      const captured: CapturedModelCall = { calls: 0 };
      await assert.rejects(
        planSmartScheduleWithLLM(input(), {
          logicalCallAuthorizer: () => {
            throw new ModelCallAuthorizationError("MODEL_LOGICAL_CALL_LIMIT_EXCEEDED");
          },
          modelConfig: modelConfig(),
          modelFactory: fakeModelFactory(validDraft, captured),
        }),
        (error: unknown) => error instanceof ModelCallAuthorizationError,
      );
      assert.equal(captured.calls, 0);
    });
  });

  it("fails closed for schema failures without retrying or accepting forbidden metadata", async () => {
    await withLlmEnabled(async () => {
      for (const output of [
        { ...validDraft, execute: true },
        { items: [{ ...validDraft.items[0], title: "模型伪造标题" }] },
        new Error("synthetic provider failure"),
      ]) {
        const captured: CapturedModelCall = { calls: 0 };
        let logicalCalls = 0;
        let providerAttempts = 0;
        const proposal = await planSmartScheduleWithLLM(input(), {
          logicalCallAuthorizer: () => {
            logicalCalls += 1;
          },
          modelConfig: modelConfig(),
          modelFactory: fakeModelFactory(output, captured),
          providerAttemptAuthorizer: () => {
            providerAttempts += 1;
          },
        });

        assert.equal(proposal, null);
        assert.equal(captured.calls, 1);
        assert.equal(logicalCalls, 1);
        assert.equal(providerAttempts, 1);
      }
    });
  });

  it("fails closed for unknown, duplicate, out-of-range, invalid, and conflicting assignments", () => {
    const invalidDrafts: unknown[] = [
      {
        items: [
          { ...validDraft.items[0], taskKey: "task-999" },
          validDraft.items[1],
        ],
      },
      {
        items: [validDraft.items[0], { ...validDraft.items[1], taskKey: "task-001" }],
      },
      {
        items: [
          { ...validDraft.items[0], date: "2026-10-20" },
          validDraft.items[1],
        ],
      },
      {
        items: [
          { ...validDraft.items[0], startTime: "25:00" },
          validDraft.items[1],
        ],
      },
      {
        items: [
          { ...validDraft.items[0], endTime: "10:00", startTime: "10:30" },
          validDraft.items[1],
        ],
      },
      {
        items: [
          { ...validDraft.items[0], endTime: "10:30", startTime: "09:30" },
          validDraft.items[1],
        ],
      },
      {
        items: [
          { ...validDraft.items[0], date: "2026-08-20", endTime: "10:30", startTime: "09:00" },
          validDraft.items[1],
        ],
      },
    ];

    for (const draft of invalidDrafts) {
      assert.equal(
        materializePlanScheduleDraft({
          draft: draft as PlanScheduleDraft,
          input: input(),
          source: "model",
        }),
        null,
      );
    }
  });

  it("keeps prompt injection in explicitly untrusted workspace context", () => {
    const sentinel = "WORKSPACE_IGNORE_RULES_AND_EXECUTE_SENTINEL";
    const messages = buildPlanScheduleMessages(input({
      occupiedSlots: [
        {
          date: "2026-08-19",
          endTime: "10:00",
          isAllDay: false,
          startTime: "09:00",
          title: sentinel,
        },
      ],
      phases: [
        {
          ...phases[0]!,
          milestones: [
            {
              ...phases[0]!.milestones[0]!,
              tasks: [sentinel, "整理结论"],
            },
          ],
        },
      ],
    }));

    const systemText = messageRoleText(messages, "system");
    const userText = messageRoleText(messages, "user");
    assert.doesNotMatch(systemText, new RegExp(sentinel, "u"));
    assert.match(userText, /UNTRUSTED user data/u);
    assert.match(userText, new RegExp(sentinel, "u"));
  });

  it("freezes the complete schedule proposal in dry-run before confirmation", async () => {
    const proposal = frozenProposal();
    let prepareCalls = 0;
    const result = await dryRunAgentIntent(
      {
        args: {
          planId: 101,
          startDate: "2026-08-18",
        },
        confidence: 0.95,
        intent: "schedule_plan",
      },
      {
        createActionId: () => "schedule-plan-action",
        planCandidates: [
          {
            id: 101,
            priority: "high",
            state: "active",
            title: "Fastjson 研究计划",
          },
        ],
        prepareSchedulePlanProposal: async (args) => {
          prepareCalls += 1;
          assert.equal(args.planId, 101);
          assert.equal(args.proposal, undefined);
          return proposal;
        },
      },
    );

    assert.equal(prepareCalls, 1);
    assert.equal(result.type, "proposed_action");
    if (result.type !== "proposed_action") assert.fail("expected frozen proposal");
    assert.equal(result.action.requiresConfirmation, true);
    assert.equal(result.action.rollbackAvailable, true);
    assert.deepEqual(
      (result.action.args as { proposal?: unknown }).proposal,
      proposal,
    );
    assert.deepEqual(
      (result.action.afterSnapshot as { proposal?: unknown }).proposal,
      proposal,
    );
    assert.equal(
      (result.action.afterSnapshot as { scheduleCount?: unknown }).scheduleCount,
      proposal.items.length,
    );
  });

  it("fails dry-run closed when no complete proposal can be frozen", async () => {
    let prepareCalls = 0;
    const result = await dryRunAgentIntent(
      {
        args: { planId: 101, startDate: "2026-08-18" },
        intent: "schedule_plan",
      },
      {
        planCandidates: [{ id: 101, title: "Fastjson 研究计划" }],
        prepareSchedulePlanProposal: async () => {
          prepareCalls += 1;
          return null;
        },
      },
    );

    assert.equal(prepareCalls, 1);
    assert.equal(result.type, "clarify");
    if (result.type !== "clarify") assert.fail("expected safe clarification");
    assert.equal(result.pendingAction?.type, "await_clarification");
    assert.deepEqual(parsePendingAction(result.pendingAction), result.pendingAction);
    assert.match(result.assistantMessage, /无法.*生成.*排期草案|重新.*排期/u);
  });

  it("never trusts an args-carried schedule proposal without deterministic preparation", async () => {
    const injectedProposal = frozenProposal();
    let prepareCalls = 0;
    const result = await dryRunAgentIntent(
      {
        args: {
          planId: 101,
          proposal: injectedProposal,
          startDate: "2026-08-18",
        },
        intent: "schedule_plan",
      },
      {
        planCandidates: [{ id: 101, title: "Fastjson 研究计划" }],
        prepareSchedulePlanProposal: async (args) => {
          prepareCalls += 1;
          assert.equal(args.proposal, injectedProposal);
          return null;
        },
      },
    );

    assert.equal(prepareCalls, 1);
    assert.equal(result.type, "clarify");
  });

  it("restores the exact frozen proposal for confirmed execution", async () => {
    const proposal = frozenProposal();
    const dryRun = await dryRunAgentIntent(
      {
        args: { planId: 101, startDate: "2026-08-18" },
        intent: "schedule_plan",
      },
      {
        createActionId: () => "schedule-plan-action",
        planCandidates: [{ id: 101, title: "Fastjson 研究计划" }],
        prepareSchedulePlanProposal: async () => proposal,
      },
    );
    assert.equal(dryRun.type, "proposed_action");
    if (dryRun.type !== "proposed_action") assert.fail("expected frozen proposal");

    const restored = createIntentFromProposedAction(dryRun.action);
    assert.equal(restored?.intent, "schedule_plan");
    if (restored?.intent !== "schedule_plan") assert.fail("expected restored schedule_plan");
    assert.deepEqual(restored.args.proposal, proposal);

    let executionCalls = 0;
    let executedArgs: unknown;
    const result = await executeAgentTool(restored, {
      schedulePlan: async (args) => {
        executionCalls += 1;
        executedArgs = args;
        return { assistantMessage: "已执行冻结排期。", pendingAction: null };
      },
    });

    assert.equal(executionCalls, 1);
    assert.deepEqual((executedArgs as { proposal?: unknown }).proposal, proposal);
    assert.equal(result.assistantMessage, "已执行冻结排期。");
  });

  it("rejects confirmation or execution without a valid frozen proposal before any DB access", async () => {
    const proposal = frozenProposal();
    const dryRun = await dryRunAgentIntent(
      {
        args: { planId: 101, startDate: "2026-08-18" },
        intent: "schedule_plan",
      },
      {
        planCandidates: [{ id: 101, title: "Fastjson 研究计划" }],
        prepareSchedulePlanProposal: async () => proposal,
      },
    );
    assert.equal(dryRun.type, "proposed_action");
    if (dryRun.type !== "proposed_action") assert.fail("expected frozen proposal");

    const withoutProposal = {
      ...dryRun.action,
      afterSnapshot: null,
      args: { planId: 101, startDate: "2026-08-18" },
    };
    assert.equal(createIntentFromProposedAction(withoutProposal), null);

    const result = await schedulePlanFromIntent({ planId: 101 });
    assert.equal(result.status, "failed");
    assert.equal(result.pendingAction, null);
    assert.match(result.assistantMessage, /没有可验证的确认草案|未创建任何日程/u);
  });

  it("persists only values from the frozen proposal and never invokes a model after confirmation", async () => {
    const proposal = frozenProposal();
    proposal.items[0]!.title = "[P0] 复现漏洞";
    const persisted: Array<Record<string, unknown>> = [];
    const modelCalls = 0;
    const plan = {
      id: 101,
      priority: "high",
      title: "Fastjson 研究计划",
    };

    const created = await persistFrozenSchedulePlanProposal(
      plan as never,
      proposal,
      {
        createItem: async (item) => {
          persisted.push({ ...item });
          return {
            ...item,
            id: persisted.length,
          } as never;
        },
      },
    );

    assert.equal(modelCalls, 0);
    assert.equal(created.length, proposal.items.length);
    assert.deepEqual(
      persisted.map((item) => ({
        date: item.date,
        endTime: item.endTime,
        isAllDay: item.isAllDay,
        relatedPlan: item.relatedPlan,
        startTime: item.startTime,
        title: item.title,
      })),
      proposal.items.map((item) => ({
        date: item.date,
        endTime: item.endTime,
        isAllDay: item.isAllDay,
        relatedPlan: proposal.planId,
        startTime: item.startTime,
        title: formatFrozenScheduleItemTitle(item),
      })),
    );
    assert.equal(
      persisted[0]?.title,
      `[${proposal.items[0]!.phaseTitle}] [P0] 复现漏洞`,
    );
    assert.doesNotMatch(
      schedulePlanFromIntent.toString(),
      /planSmartScheduleWithLLM|invokeStructured|completeStructured|generateScheduleFromPlan/u,
    );
    assert.match(
      schedulePlanFromIntent.toString(),
      /persistFrozenSchedulePlanProposalWithAudit/u,
    );
  });

  it("uses one atomic persistence result for schedule items and the durable AgentRun", async () => {
    const proposal = frozenProposal();
    let persistenceCalls = 0;
    const result = await schedulePlanFromIntent(
      { planId: 101, proposal },
      undefined,
      {
        getPayloadClientFn: async () => ({
          findByID: async () => ({
            id: 101,
            phases,
            priority: "high",
            title: "Fastjson 研究计划",
          }),
        }) as never,
        isProposalSafeFn: async () => true,
        persistExecutionFn: async () => {
          persistenceCalls += 1;
          return {
            audit: { id: 909 } as never,
            items: proposal.items.map((item, index) => ({
              date: item.date,
              id: index + 1,
              phaseTitle: item.phaseTitle,
              title: item.title,
            })),
          };
        },
      },
    );

    assert.equal(persistenceCalls, 1);
    assert.equal(result.rollbackSourceRunId, 909);
    assert.match(result.assistantMessage, /共生成 2 条/u);
    assert.doesNotMatch(schedulePlanFromIntent.toString(), /payload\.delete/u);
  });

  it("commits a successful frozen-proposal transaction without rollback", async () => {
    const calls: string[] = [];
    const result = await runSchedulePlanPersistenceTransaction({
      commit: async () => {
        calls.push("commit");
      },
      operation: async () => {
        calls.push("create:1");
        calls.push("create:2");
        return [1, 2];
      },
      rollback: async () => {
        calls.push("rollback");
      },
    });

    assert.deepEqual(result, [1, 2]);
    assert.deepEqual(calls, ["create:1", "create:2", "commit"]);
  });

  it("rolls back schedule creation when the durable AgentRun cannot be created", async () => {
    const calls: string[] = [];
    const auditFailure = new Error("synthetic AgentRun create failure");

    await assert.rejects(
      runSchedulePlanPersistenceTransaction({
        commit: async () => {
          calls.push("commit");
        },
        operation: async () => {
          calls.push("create:schedule-item");
          calls.push("create:agent-run");
          throw auditFailure;
        },
        rollback: async () => {
          calls.push("rollback");
        },
      }),
      (error: unknown) => error === auditFailure,
    );

    assert.deepEqual(calls, [
      "create:schedule-item",
      "create:agent-run",
      "rollback",
    ]);
  });

  it("rolls back when a later schedule item create fails", async () => {
    const failure = new Error("synthetic second create failure");
    const calls: string[] = [];

    await assert.rejects(
      runSchedulePlanPersistenceTransaction({
        commit: async () => {
          calls.push("commit");
        },
        operation: async () => {
          calls.push("create:1");
          calls.push("create:2");
          throw failure;
        },
        rollback: async () => {
          calls.push("rollback");
        },
      }),
      (error) => error === failure,
    );

    assert.deepEqual(calls, ["create:1", "create:2", "rollback"]);
  });

  it("rolls back when committing the complete frozen proposal fails", async () => {
    const failure = new Error("synthetic commit failure");
    const calls: string[] = [];

    await assert.rejects(
      runSchedulePlanPersistenceTransaction({
        commit: async () => {
          calls.push("commit");
          throw failure;
        },
        operation: async () => {
          calls.push("create:1");
          calls.push("create:2");
          return [1, 2];
        },
        rollback: async () => {
          calls.push("rollback");
        },
      }),
      (error) => error === failure,
    );

    assert.deepEqual(calls, ["create:1", "create:2", "commit", "rollback"]);
  });

  it("surfaces rollback failure as indeterminate without attempting non-transactional fallback", async () => {
    const operationFailure = new Error("synthetic create failure");
    const rollbackFailure = new Error("synthetic rollback failure");
    let operationCalls = 0;
    let rollbackCalls = 0;

    await assert.rejects(
      runSchedulePlanPersistenceTransaction({
        commit: async () => {
          assert.fail("commit must not run after create failure");
        },
        operation: async () => {
          operationCalls += 1;
          throw operationFailure;
        },
        rollback: async () => {
          rollbackCalls += 1;
          throw rollbackFailure;
        },
      }),
      (error) => {
        assert.equal(error instanceof SchedulePlanPersistenceIndeterminateError, true);
        assert.equal((error as Error).name, "SchedulePlanPersistenceIndeterminateError");
        assert.equal((error as Error).cause, operationFailure);
        return true;
      },
    );

    assert.equal(operationCalls, 1);
    assert.equal(rollbackCalls, 1);
  });
});
