import assert from "node:assert/strict";
import { test } from "node:test";

import { groupTasksIntoParallelLayers } from "../../src/lib/agent/orchestration/parallel-layers";
import type { TaskNode } from "../../src/lib/agent/orchestration/types";

const task = (id: string, dependsOn: string[] = []): TaskNode => ({
  agentRole: "plan",
  args: {},
  dependsOn,
  id,
  intent: "compose_plan",
  label: id,
});

test("groupTasksIntoParallelLayers groups independent tasks together", () => {
  const { layers, orphanedTaskIds } = groupTasksIntoParallelLayers([
    task("a"),
    task("b"),
    task("c", ["a", "b"]),
  ]);

  assert.equal(layers.length, 2);
  assert.equal(layers[0]?.length, 2);
  assert.equal(layers[1]?.[0]?.id, "c");
  assert.equal(orphanedTaskIds.length, 0);
});
