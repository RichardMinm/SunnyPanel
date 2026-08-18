import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { contentAgentDefinition } from "../../../src/lib/agent/agents/registry";
import { runSpecializedAgentForTask } from "../../../src/lib/agent/agents/run-specialized-agent";
import { createModelCallBudgetRecorder } from "../../../src/lib/agent/orchestration/model-call-budget";
import type { TaskNode } from "../../../src/lib/agent/orchestration/types";
import type { AgentPromptContext } from "../../../src/lib/agent/prompts";
import type { AgentIntent } from "../../../src/lib/agent/schemas";
import { dryRunAgentIntent } from "../../../src/lib/agent/safety";

const promptContext: AgentPromptContext = {
  checklists: [],
  contentItems: [],
  now: "2026-08-18T10:00:00.000+08:00",
  pendingAction: null,
  plans: [],
};

const contentTask = (
  intent: AgentIntent,
  id: string,
): TaskNode => ({
  agentRole: "content",
  args: intent.args,
  dependsOn: [],
  id,
  intent: intent.intent,
  label: "内容叙事处理",
});

const completeTimeline: AgentIntent = {
  args: {
    createEvent: true,
    sourceId: 51,
    sourceText: "Agent Inbox 已完成发布并进入稳定运行。",
    sourceTitle: "Agent Inbox 上线",
    sourceType: "post",
    type: "milestone",
    visibility: "public",
  },
  confidence: 0.9,
  intent: "compose_timeline_event",
};

const incompleteTimeline: AgentIntent = {
  args: {
    createEvent: true,
    sourceId: null,
    sourceText: null,
    sourceTitle: null,
    sourceType: null,
    type: null,
    visibility: "private",
  },
  confidence: 0.82,
  intent: "compose_timeline_event",
};

const completionNote: AgentIntent = {
  args: {
    checklistTitle: "上线清单",
    completionNote: "验证通过并完成交付。",
    itemTitle: "发布 Agent Inbox",
  },
  confidence: 0.9,
  intent: "add_completion_note",
};

describe("L3-D5 deterministic Content ownership boundary", () => {
  it("retires the generic Content specialist model seam", () => {
    assert.equal(contentAgentDefinition.enrichIntent, undefined);
  });

  it("uses zero specialist model calls for complete and incomplete Timeline drafts and completion notes", async () => {
    for (const [intent, id] of [
      [completeTimeline, "content-complete-timeline"],
      [incompleteTimeline, "content-incomplete-timeline"],
      [completionNote, "content-completion-note"],
    ] as const) {
      const recorder = createModelCallBudgetRecorder();
      const result = await runSpecializedAgentForTask(
        contentTask(intent, id),
        {
          dryRunContext: {} as never,
          intent,
          message: "处理内容任务",
          modelCallRecorder: recorder,
          promptContext,
        },
      );

      assert.equal(result.disposition, "bypassed_complete");
      assert.equal(result.intent.intent, intent.intent);
      for (const [key, value] of Object.entries(intent.args)) {
        assert.deepEqual(
          (result.intent.args as Record<string, unknown>)[key],
          value,
          `deterministic Content fact ${key} must be preserved`,
        );
      }
      assert.equal(recorder.snapshot().specialistLogicalCalls, 0);
      assert.equal(recorder.snapshot().specialistProviderAttempts, 0);
    }
  });

  it("clarifies an ambiguous Timeline source deterministically without creating a proposal", async () => {
    const result = await dryRunAgentIntent(incompleteTimeline);

    assert.equal(result.type, "clarify");
    if (result.type !== "clarify") assert.fail("expected deterministic clarification");
    assert.equal(result.pendingAction, null);
    assert.match(result.assistantMessage, /来源类型和标题|一段要整理/u);
  });

  it("preserves trusted resource, visibility, and persistence choices in the deterministic proposal", async () => {
    const result = await dryRunAgentIntent(completeTimeline, {
      createActionId: () => "timeline-action",
      now: "2026-08-18T10:00:00.000+08:00",
    });

    assert.equal(result.type, "proposed_action");
    if (result.type !== "proposed_action") assert.fail("expected deterministic Timeline proposal");
    assert.equal(result.action.intent, "compose_timeline_event");
    assert.equal(result.action.requiresConfirmation, true);
    const proposal = result.action.afterSnapshot as {
      relatedFields?: { relatedPost?: number };
      visibility?: string;
    };
    assert.equal(proposal.relatedFields?.relatedPost, 51);
    assert.equal(proposal.visibility, "public");
  });

  it("keeps active Content sources free of Legacy model transport and manual JSON", () => {
    const activeSources = [
      "src/lib/agent/agents/registry.ts",
      "src/lib/agent/workflows/timeline-composer.ts",
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    assert.doesNotMatch(activeSources, /enrichContentIntent|buildContentAgentSystemPrompt/u);
    assert.doesNotMatch(activeSources, /completeStructured/u);
    assert.doesNotMatch(activeSources, /fetchWithRetry|\/chat\/completions/u);
    assert.doesNotMatch(activeSources, /extractJSONObject|JSON\.parse|content\.match\(/u);
  });
});
