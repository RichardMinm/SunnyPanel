import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertSuccessfulAgentSseEvents,
  parseAgentSseText,
} from "../../scripts/lib/agent-sse-contract.mjs";

const event = (name: string, data: unknown) =>
  `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

type SseEvent = {
  data: unknown;
  event: string;
};

const successfulEvents = (): SseEvent[] => parseAgentSseText([
  event("status", { status: "处理中" }),
  event("token", { content: "完成" }),
  event("done", { assistantMessage: "完成" }),
  event("terminal", {
    partialOutputEmitted: false,
    persist: true,
    retryable: false,
    status: "complete",
  }),
].join("")) as SseEvent[];

test("release Agent SSE contract accepts one complete terminal after done", () => {
  const events = successfulEvents();

  assert.deepEqual(assertSuccessfulAgentSseEvents(events), {
    partialOutputEmitted: false,
    persist: true,
    retryable: false,
    status: "complete",
  });
});

test("release Agent SSE contract rejects missing or duplicate terminals", () => {
  const withoutTerminal = successfulEvents().filter(({ event: name }) =>
    name !== "terminal"
  );
  const duplicateTerminal = [
    ...successfulEvents(),
    successfulEvents().at(-1)!,
  ];

  assert.throws(
    () => assertSuccessfulAgentSseEvents(withoutTerminal),
    /exactly one terminal event; received 0/,
  );
  assert.throws(
    () => assertSuccessfulAgentSseEvents(duplicateTerminal),
    /exactly one terminal event; received 2/,
  );
});

test("release Agent SSE contract rejects done after terminal and trailing events", () => {
  const valid = successfulEvents();
  const doneAfterTerminal = [valid[0], valid[1], valid[3], valid[2]];
  const trailingEvent = [...valid, { data: { status: "late" }, event: "status" }];

  assert.throws(
    () => assertSuccessfulAgentSseEvents(doneAfterTerminal),
    /must emit done before terminal/,
  );
  assert.throws(
    () => assertSuccessfulAgentSseEvents(trailingEvent),
    /terminal must be the final event/,
  );
});

test("release Agent SSE contract rejects non-success and non-persisted terminals", () => {
  const partial = successfulEvents().map((item) =>
    item.event === "terminal"
      ? {
          data: {
            partialOutputEmitted: true,
            persist: false,
            retryable: true,
            status: "partial",
          },
          event: "terminal",
        }
      : item
  );
  const notPersisted = successfulEvents().map((item) =>
    item.event === "terminal"
      ? { data: { persist: false, status: "complete" }, event: "terminal" }
      : item
  );

  assert.throws(
    () => assertSuccessfulAgentSseEvents(partial),
    /status=complete and persist=true/,
  );
  assert.throws(
    () => assertSuccessfulAgentSseEvents(notPersisted),
    /status=complete and persist=true/,
  );
});

test("release Agent SSE parser rejects malformed event blocks", () => {
  assert.throws(
    () => parseAgentSseText('data: {"status":"complete"}\n\n'),
    /without an event name/,
  );
  assert.throws(
    () => parseAgentSseText("event: terminal\ndata: not-json\n\n"),
    /invalid JSON for terminal/,
  );
});
