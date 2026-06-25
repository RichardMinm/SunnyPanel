import assert from "node:assert/strict";
import test from "node:test";

import { createAsyncSingleton } from "../../src/lib/payload/async-singleton";

test("async singleton shares one in-flight initialization", async () => {
  let calls = 0;
  let release: (() => void) | undefined;
  const load = createAsyncSingleton(
    () =>
      new Promise<{ id: number }>((resolve) => {
        calls += 1;
        release = () => resolve({ id: 1 });
      }),
  );

  const first = load();
  const second = load();

  assert.equal(calls, 1);
  assert.strictEqual(second, first);
  release?.();
  assert.deepEqual(await Promise.all([first, second]), [
    { id: 1 },
    { id: 1 },
  ]);
});

test("async singleton permits a fresh initialization after rejection", async () => {
  let calls = 0;
  const load = createAsyncSingleton(async () => {
    calls += 1;

    if (calls === 1) {
      throw new Error("cold start failed");
    }

    return { id: 2 };
  });

  await assert.rejects(load(), /cold start failed/);
  assert.deepEqual(await load(), { id: 2 });
  assert.equal(calls, 2);
});
