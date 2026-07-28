import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { composeTimelineEventFromIntent } from "../../src/lib/agent/tools/timeline-tools";
import {
  resetPayloadStub,
  setPayloadStubCreateHandler,
} from "../stubs/payload-client";

beforeEach(() => resetPayloadStub());

test("explicit Timeline creation returns the ID of its rollback AgentRun", async () => {
  setPayloadStubCreateHandler(async (input) => {
    const args = input as { collection?: string; data?: Record<string, unknown> };

    if (args.collection === "timeline-events") {
      return {
        id: 801,
        visibility: "private",
        ...args.data,
      };
    }

    if (args.collection === "agent-runs") {
      return {
        id: 901,
        ...args.data,
      };
    }

    throw new Error(`unexpected collection ${args.collection ?? "unknown"}`);
  });

  const result = await composeTimelineEventFromIntent({
    createEvent: true,
    sourceText: "发布了第一版",
    sourceType: "free_text",
    visibility: "private",
  });

  assert.equal(result.rollbackSourceRunId, 901);
  assert.equal(
    (result.rollbackPayload as { target?: { documentId?: number } }).target?.documentId,
    801,
  );
});
