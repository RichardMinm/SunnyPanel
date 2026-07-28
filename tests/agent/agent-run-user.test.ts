import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { runWithAgentExecutionContext } from "../../src/lib/agent/execution-context";
import { createAgentRun } from "../../src/lib/agent/tool-shared";
import {
  getPayloadClient,
  getPayloadStubOperations,
  resetPayloadStub,
  setPayloadStubCreateHandler,
} from "../stubs/payload-client";

beforeEach(() => {
  resetPayloadStub();
});

test("createAgentRun stores the current execution user", async () => {
  const payload = await getPayloadClient();
  setPayloadStubCreateHandler(async () => ({ id: 91 }));

  const run = await runWithAgentExecutionContext({ userId: 7 }, async () =>
    createAgentRun({
      payload: payload as never,
      status: "succeeded",
      steps: [
        {
          level: "info",
          message: "created plan",
        },
      ],
      summary: "created plan",
      title: "Agent created plan",
      workflow: "planning",
    }),
  );

  const createArgs = getPayloadStubOperations().find((operation) => operation.type === "create")?.args as {
    data?: { user?: number };
  };

  assert.equal(createArgs.data?.user, 7);
  assert.equal((run as { id?: number } | undefined)?.id, 91);
});
