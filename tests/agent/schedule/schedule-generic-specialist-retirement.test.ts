import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  runSpecializedAgentForTask,
} from "../../../src/lib/agent/agents/run-specialized-agent";
import { evaluateSpecialistTaskCompleteness } from "../../../src/lib/agent/agents/specialist-task-completeness";
import { scheduleAgentDefinition } from "../../../src/lib/agent/agents/registry";
import { createModelCallBudgetRecorder } from "../../../src/lib/agent/orchestration/model-call-budget";
import type { TaskNode } from "../../../src/lib/agent/orchestration/types";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import type { AgentIntent } from "../../../src/lib/agent/schemas";
import { dryRunAgentTool } from "../../../src/lib/agent/tool-registry";

const promptContext: AgentPromptContext = {
  checklists: [],
  now: "2026-08-18T02:00:00.000Z",
  pendingAction: null,
  plans: [],
};

const scheduleIntents = [
  {
    args: {},
    intent: "compose_schedule_item",
    label: "整理单条日程草案",
  },
  {
    args: {
      items: [{ date: "2026-08-19", title: "复盘迁移结果" }],
      sourceType: "manual",
    },
    intent: "create_schedule_items",
    label: "创建日程列表",
  },
  {
    args: { itemId: 41, newDate: "2026-08-20" },
    intent: "reschedule_item",
    label: "改期",
  },
  {
    args: { itemId: 41, reason: "本周暂停" },
    intent: "cancel_schedule_item",
    label: "取消日程",
  },
  {
    args: { planId: 17, startDate: "2026-08-19" },
    intent: "schedule_plan",
    label: "安排计划",
  },
] as const;

const toTask = (entry: (typeof scheduleIntents)[number], index: number): TaskNode => ({
  agentRole: "schedule",
  args: entry.args,
  dependsOn: [],
  id: `schedule-task-${index + 1}`,
  intent: entry.intent,
  label: entry.label,
});

test("the production Schedule definition has no generic intent enrichment entrypoint", () => {
  assert.equal(scheduleAgentDefinition.enrichIntent, undefined);
});

test("every Schedule intent bypasses the generic specialist without consuming a model call", async () => {
  for (const [index, entry] of scheduleIntents.entries()) {
    const task = toTask(entry, index);
    const parsedIntent = evaluateSpecialistTaskCompleteness(task).intent;

    assert.ok(parsedIntent, `${entry.intent} must remain a valid typed intent`);
    assert.equal(
      evaluateSpecialistTaskCompleteness(task).disposition,
      "bypassed_complete",
      `${entry.intent} must not invoke the retired generic Schedule specialist`,
    );

    const recorder = createModelCallBudgetRecorder();
    const result = await runSpecializedAgentForTask(task, {
      dryRunContext: {},
      intent: parsedIntent as AgentIntent,
      message: entry.label,
      modelCallRecorder: recorder,
      promptContext,
    });

    assert.equal(result.disposition, "bypassed_complete");
    assert.equal(result.intent.intent, entry.intent);
    assert.equal(recorder.snapshot().specialistLogicalCalls, 0);
    assert.equal(recorder.snapshot().specialistProviderAttempts, 0);
  }
});

test("an ambiguous Schedule date still clarifies deterministically before any time model call", async () => {
  let logicalCalls = 0;
  let providerAttempts = 0;
  const result = await dryRunAgentTool(
    {
      args: {
        sourceText: "安排一次项目复盘",
        title: "项目复盘",
      },
      intent: "compose_schedule_item",
    },
    {
      now: promptContext.now,
      scheduleModelInvocation: {
        logicalCallAuthorizer: () => {
          logicalCalls += 1;
        },
        providerAttemptAuthorizer: () => {
          providerAttempts += 1;
        },
      },
    },
  );

  assert.equal(result.type, "clarify");
  if (result.type !== "clarify") assert.fail("expected deterministic clarification");
  assert.match(result.assistantMessage, /哪一天|日期/u);
  assert.equal(logicalCalls, 0);
  assert.equal(providerAttempts, 0);
});

test("the active Schedule registry and completeness gate contain no legacy generic model seam", () => {
  const registrySource = readFileSync(
    resolve(process.cwd(), "src/lib/agent/agents/registry.ts"),
    "utf8",
  );
  const completenessSource = readFileSync(
    resolve(process.cwd(), "src/lib/agent/agents/specialist-task-completeness.ts"),
    "utf8",
  );

  assert.doesNotMatch(registrySource, /schedule-agent|enrichScheduleIntent/u);
  assert.doesNotMatch(registrySource, /scheduleAgentDefinition[\s\S]*?enrichIntent\s*:/u);
  assert.match(completenessSource, /"compose_schedule_item"/u);
  assert.doesNotMatch(`${registrySource}\n${completenessSource}`, /completeStructured|complete-structured/u);
});
