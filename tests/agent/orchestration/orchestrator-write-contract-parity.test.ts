import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { OrchestratorOutput } from "../../../src/lib/agent/llm/schemas/orchestrator-output";
import {
  buildResourceIndex,
  validateResourceReadiness,
} from "../../../src/lib/agent/orchestration/resource-readiness-guard";
import { mapStructuredOutputToPlan } from "../../../src/lib/agent/orchestration/orchestrator-mapper";
import { orchestratorPlanToIntent } from "../../../src/lib/agent/orchestration/orchestrator-plan-to-intent";
import { ORCHESTRATION_WRITE_INTENTS } from "../../../src/lib/agent/intent/write-intents";
import { dryRunAgentIntent } from "../../../src/lib/agent/safety";
import { agentToolRegistry } from "../../../src/lib/agent/tool-registry";

const fakeChecklist = {
  createdAt: "2026-07-20T00:00:00.000Z",
  groups: [{
    items: [{
      completedAt: "2026-07-20T01:00:00.000Z",
      completionNote: null,
      id: "item-1",
      isCompleted: true,
      title: "完成复盘",
    }],
    title: "默认分组",
  }],
  id: 201,
  slug: "weekly",
  status: "draft",
  title: "本周任务",
  updatedAt: "2026-07-20T00:00:00.000Z",
  visibility: "private",
};

const resourceIndex = buildResourceIndex({
  checklists: [{ id: 201, title: "本周任务" }],
  plans: [{ id: 101, title: "复习计划" }],
  schedules: [{ id: 301, title: "数学复习" }],
});

const writeCases = [
  ["add_completion_note", {
    checklistTitle: "本周任务",
    completionNote: "按计划完成",
    itemTitle: "完成复盘",
  }, "plan"],
  ["append_plan_item", {
    checklistTitle: "本周任务",
    groupTitle: "默认分组",
    itemTitle: "新增任务",
  }, "plan"],
  ["cancel_schedule_item", { itemId: 301 }, "schedule"],
  ["complete_plan_item", {
    checklistTitle: "本周任务",
    itemTitle: "完成复盘",
  }, "plan"],
  ["compose_plan", { goal: "完成复习", title: "复习计划" }, "plan"],
  ["compose_schedule_item", {
    date: "2026-07-21",
    sourceText: "明天复习数学",
    title: "数学复习",
  }, "schedule"],
  ["compose_timeline_event", {
    eventDate: "2026-07-20",
    title: "完成里程碑",
  }, "content"],
  ["create_checklist", {
    groups: [{
      items: [{ title: "第一项" }],
      title: "默认分组",
    }],
    title: "新清单",
  }, "plan"],
  ["create_schedule_items", {
    items: [{ date: "2026-07-21", title: "数学复习" }],
  }, "schedule"],
  ["create_plan", { title: "新计划" }, "plan"],
  ["delete_record", {
    entityName: "旧计划",
    entityType: "plan",
  }, "plan"],
  ["modify_record", {
    changeDescription: "修改标题",
    entityName: "复习计划",
    entityType: "plan",
  }, "plan"],
  ["reschedule_item", {
    itemId: 301,
    newDate: "2026-07-22",
  }, "schedule"],
  ["save_memory", {
    content: "晚上复习效率更高",
    title: "复习偏好",
  }, "memory"],
  ["schedule_plan", { planId: 101 }, "schedule"],
  ["weekly_review", {}, "review"],
] as const;

const toOutput = (
  intent: typeof writeCases[number][0],
  args: Record<string, unknown>,
  agentRole: typeof writeCases[number][2],
): OrchestratorOutput => ({
  decisionCode: "explicit_write_ready",
  mode: "single",
  routingSummary: `准备 ${intent}`,
  tasks: [{
    agentRole,
    args,
    dependsOn: [],
    id: "t1",
    intent,
    label: intent,
  }],
  version: 2,
});

describe("orchestrator write contract parity", () => {
  it("covers every orchestration write intent with a parser-compatible task", () => {
    assert.deepEqual(
      new Set(writeCases.map(([intent]) => intent)),
      ORCHESTRATION_WRITE_INTENTS,
    );

    for (const [intent, args, agentRole] of writeCases) {
      assert.ok(agentToolRegistry[intent], `${intent}: missing tool registry entry`);

      const output = toOutput(intent, args, agentRole);
      const resources = validateResourceReadiness({
        resourceIndex,
        tasks: output.tasks,
      });
      assert.equal(resources.ready, true, `${intent}: resource contract`);

      const plan = mapStructuredOutputToPlan(output);
      const parsed = orchestratorPlanToIntent(plan);
      assert.equal(parsed?.intent, intent, `${intent}: parser contract`);
    }
  });

  it("carries every resource-bound write through real dry-run entrypoints", async () => {
    for (const [intent, args, agentRole] of writeCases.filter(([candidate]) =>
      [
        "add_completion_note",
        "append_plan_item",
        "cancel_schedule_item",
        "complete_plan_item",
        "reschedule_item",
        "schedule_plan",
      ].includes(candidate)
    )) {
      const plan = mapStructuredOutputToPlan(toOutput(intent, args, agentRole));
      const parsed = orchestratorPlanToIntent(plan);
      assert.ok(parsed, `${intent}: parser returned null`);

      const result = await dryRunAgentIntent(parsed, {
        createActionId: () => `dry-run-${intent}`,
        findTimelineEvent: async () => null,
        planCandidates: [{ id: 101, priority: "high", state: "active", title: "复习计划" }],
        resolveChecklistGroupForAppend: async () => ({
          question: null,
          resolved: {
            checklist: fakeChecklist as never,
            group: fakeChecklist.groups[0] as never,
            groupIndex: 0,
          },
        }),
        resolveChecklistItem: async () => ({
          question: null,
          resolved: {
            checklist: fakeChecklist as never,
            group: fakeChecklist.groups[0] as never,
            groupIndex: 0,
            item: {
              ...fakeChecklist.groups[0].items[0],
              isCompleted: intent === "add_completion_note",
            } as never,
            itemIndex: 0,
          },
        }),
        resolveScheduleItem: async (itemId) => ({
          date: "2026-07-20",
          id: itemId,
          priority: "medium",
          status: "planned",
          title: "数学复习",
        }),
      });

      assert.equal(
        result.type === "proposed_action"
          || (result.type === "bypass" && result.action !== undefined),
        true,
        `${intent}: dry-run contract`,
      );
    }
  });
});
