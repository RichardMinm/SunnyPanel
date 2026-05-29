import assert from "node:assert/strict";
import { test } from "node:test";

import {
  composeTimelineEventProposal,
  formatTimelineProposal,
  isTimelineComposerSourceAmbiguous,
} from "../../src/lib/agent/workflows/timeline-composer";

test("compose timeline event from update", () => {
  const proposal = composeTimelineEventProposal(
    {
      sourceId: 7,
      sourceText: "Agent Inbox 让建议从临时 prompt 变成可追踪队列。",
      sourceTitle: "发布 Agent Inbox",
      sourceType: "update",
      visibility: "public",
    },
    "2026-05-08T00:00:00.000Z",
  );

  assert.ok(proposal);
  assert.equal(proposal.sourceType, "update");
  assert.equal(proposal.relatedFields.relatedUpdate, 7);
  assert.equal(proposal.visibility, "public");
  assert.equal(proposal.status, "published");
  assert.equal(proposal.type, "milestone");
  assert.equal(proposal.isFeatured, true);
  assert.match(formatTimelineProposal(proposal), /Timeline title：发布 Agent Inbox/);
});

test("compose timeline event from checklist completion", () => {
  const proposal = composeTimelineEventProposal(
    {
      checklistTitle: "SunnyPanel 周计划",
      eventDate: "2026-05-07T13:00:00.000Z",
      groupTitle: "Agent",
      itemTitle: "完成 Timeline Composer",
      relatedTaskKey: "item-22",
      sourceId: 21,
      sourceText: "把完成项整理成一个更有语义的公开记忆节点。",
      sourceType: "checklist_item",
      visibility: "public",
    },
    "2026-05-08T00:00:00.000Z",
  );

  assert.ok(proposal);
  assert.equal(proposal.title, "SunnyPanel 周计划 · Agent / 完成 Timeline Composer 完成");
  assert.equal(proposal.relatedFields.relatedChecklist, 21);
  assert.equal(proposal.relatedFields.relatedTaskKey, "item-22");
  assert.equal(proposal.type, "milestone");
  assert.match(proposal.reason, /完成动作/);
});

test("ambiguous timeline source is detected", () => {
  assert.equal(isTimelineComposerSourceAmbiguous({ sourceType: "update" }), true);
  assert.equal(isTimelineComposerSourceAmbiguous({ sourceText: "今天完成了一个重要节点。" }), false);
});
