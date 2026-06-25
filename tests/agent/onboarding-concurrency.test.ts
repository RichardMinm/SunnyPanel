import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  createInitialWorkspaceEnsurer,
  createGlobalInFlightGate,
  createInFlightGate,
  mapSequentially,
  withPostgresAdvisoryLock,
} from "../../src/lib/payload/onboarding";

test("onboarding serializes same-collection seed writes", async () => {
  let active = 0;
  let maxActive = 0;
  const result = await mapSequentially(
    ["first", "second", "third"],
    async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;

      return value.toUpperCase();
    },
  );

  assert.equal(maxActive, 1);
  assert.deepEqual(result, ["FIRST", "SECOND", "THIRD"]);
});

test("onboarding shares one in-flight initialization and releases the gate afterward", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const gated = createInFlightGate(async (value: number) => {
    calls += 1;
    await new Promise<void>((resolve) => {
      release = resolve;
    });

    return value;
  });
  const first = gated(1);
  const second = gated(2);

  assert.equal(calls, 1);
  release?.();
  assert.equal(await first, 1);
  assert.equal(await second, 1);

  const third = gated(3);
  assert.equal(calls, 2);
  release?.();
  assert.equal(await third, 3);
});

test("onboarding shares an in-flight initialization across module-level gate instances", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const key = `test-onboarding-${crypto.randomUUID()}`;
  const run = async (value: number) => {
    calls += 1;
    await new Promise<void>((resolve) => {
      release = resolve;
    });

    return value;
  };
  const firstGate = createGlobalInFlightGate(key, run);
  const secondGate = createGlobalInFlightGate(key, run);
  const first = firstGate(1);
  const second = secondGate(2);

  assert.equal(calls, 1);
  release?.();
  assert.equal(await first, 1);
  assert.equal(await second, 1);
});

test("onboarding advisory lock is always released after initialization", async () => {
  const queries: Array<{
    params?: unknown[];
    text: string;
  }> = [];
  let ended = 0;
  const result = await withPostgresAdvisoryLock(
    "test-workspace",
    async () => "ready",
    {
      connectionString: "postgresql://unused/test",
      createClient: () => ({
        connect: async () => undefined,
        end: async () => {
          ended += 1;
        },
        query: async (
          text: string,
          params?: unknown[],
        ) => {
          queries.push({ params, text });
          return {};
        },
      }),
    },
  );

  assert.equal(result, "ready");
  assert.equal(ended, 1);
  assert.match(queries[0]?.text ?? "", /pg_advisory_lock/);
  assert.match(queries[1]?.text ?? "", /pg_advisory_unlock/);
  assert.deepEqual(queries[0]?.params, ["test-workspace"]);
});

test("onboarding rechecks durable seed marker after acquiring advisory lock", async () => {
  const calls: string[] = [];
  const ensureInitialWorkspace = createInitialWorkspaceEnsurer({
    gateKey: `test-onboarding-${crypto.randomUUID()}`,
    hasSeed: async () => {
      calls.push("hasSeed");
      return true;
    },
    lock: async (key, run) => {
      calls.push(`lock:${key}`);
      return run();
    },
    lockKey: "test-lock",
    seed: async () => {
      calls.push("seed");
    },
  });

  await ensureInitialWorkspace({} as never, { id: 1 } as never);

  assert.deepEqual(calls, ["lock:test-lock", "hasSeed"]);
});

test("onboarding writes disable relationship depth population", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/lib/payload/onboarding.ts"),
    "utf8",
  );
  const writeBlocks = [
    ...source.matchAll(
      /payload\.(?:create|update)\(\{\n\s*collection: "(?:agent-runs|plans)",[\s\S]*?\n\s*\}\);/g,
    ),
  ].map((match) => match[0]);

  assert.ok(writeBlocks.length >= 4, "expected onboarding plan/agent-run writes");

  for (const block of writeBlocks) {
    assert.match(block, /depth:\s*0/);
  }
});

test("agent context loading does not trigger workspace onboarding writes", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/lib/payload/workspace.ts"),
    "utf8",
  );

  assert.match(
    source,
    /getAgentWorkspaceContextSource[\s\S]*seedInitialWorkspace:\s*false/,
  );
});
