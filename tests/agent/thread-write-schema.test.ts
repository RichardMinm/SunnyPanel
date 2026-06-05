import assert from "node:assert/strict";
import test from "node:test";

import { validateAgentThreadData } from "../../src/lib/agent/write-schemas";

const requiredThreadIntents = ["answer_question", "cancel_schedule_item", "reschedule_item"] as const;

test("agent thread write schema accepts all active thread intents", () => {
  for (const intent of requiredThreadIntents) {
    const data = validateAgentThreadData({
      lastIntent: intent,
      messages: [],
      pendingAction: null,
      status: "active",
    });

    assert.equal(data.lastIntent, intent);
  }
});
