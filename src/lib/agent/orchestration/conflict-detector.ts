import type { TaskNode } from "./types";

export type TaskConflict = {
  description: string;
  severity: "error" | "warning";
  tasks: [string, string];
  type: "circular_dependency" | "ordering_violation" | "resource_write_conflict" | "schedule_overlap" | "semantic_duplicate";
};

type DateRangeArgs = {
  date?: string;
  dateRange?: [string, string];
  endTime?: string;
  startTime?: string;
};

const padTime = (t: string): string => {
  const parts = t.split(":");
  if (parts.length !== 2) return t;
  const [h, m] = parts;

  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
};

const hasTimeOverlap = (
  a: DateRangeArgs,
  b: DateRangeArgs,
): boolean => {
  const aDate = a.date ?? a.dateRange?.[0];
  const bDate = b.date ?? b.dateRange?.[0];

  if (!aDate || !bDate) return false;
  if (aDate !== bDate) return false;

  const aStart = padTime(a.startTime ?? "00:00");
  const aEnd = padTime(a.endTime ?? "23:59");
  const bStart = padTime(b.startTime ?? "00:00");
  const bEnd = padTime(b.endTime ?? "23:59");

  return aStart < bEnd && bStart < aEnd;
};

const SCHEDULE_INTENTS = new Set([
  "compose_schedule_item",
  "reschedule_item",
  "schedule_plan",
]);

const WRITE_INTENTS = new Set([
  "compose_plan",
  "create_plan",
  "append_plan_item",
  "complete_plan_item",
  "add_completion_note",
  "save_memory",
  "weekly_review",
  "compose_timeline_event",
  "cancel_schedule_item",
]);

const getCollectionForIntent = (intent: string): string | null => {
  if (intent === "compose_plan" || intent === "create_plan" || intent === "append_plan_item" ||
      intent === "complete_plan_item" || intent === "add_completion_note" || intent === "schedule_plan") {
    return "plans";
  }

  if (intent === "compose_schedule_item" || intent === "reschedule_item" || intent === "cancel_schedule_item") {
    return "schedule-items";
  }

  if (intent === "compose_timeline_event") {
    return "timeline-events";
  }

  if (intent === "save_memory") {
    return "agent-memories";
  }

  if (intent === "weekly_review") {
    return "plan-reviews";
  }

  return null;
};

const detectCycle = (tasks: TaskNode[]): [string, string] | null => {
  const adjacency = new Map<string, string[]>();

  for (const task of tasks) {
    for (const depId of task.dependsOn) {
      const deps = adjacency.get(task.id) ?? [];
      deps.push(depId);
      adjacency.set(task.id, deps);
    }
  }

  const visited = new Set<string>();
  const stack = new Set<string>();
  let cycleEdge: [string, string] | null = null;

  const dfs = (nodeId: string): boolean => {
    visited.add(nodeId);
    stack.add(nodeId);

    for (const depId of adjacency.get(nodeId) ?? []) {
      if (!visited.has(depId)) {
        if (dfs(depId)) return true;
      } else if (stack.has(depId)) {
        cycleEdge = [nodeId, depId];

        return true;
      }
    }

    stack.delete(nodeId);

    return false;
  };

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      if (dfs(task.id)) return cycleEdge;
    }
  }

  return null;
};

const detectOrderingViolation = (
  tasks: TaskNode[],
  layers: TaskNode[][],
): [string, string] | null => {
  const taskIndex = new Map(tasks.map((t, i) => [t.id, i]));
  const layerIndex = new Map<string, number>();

  for (let i = 0; i < layers.length; i++) {
    for (const task of layers[i]) {
      layerIndex.set(task.id, i);
    }
  }

  for (const task of tasks) {
    const taskLayer = layerIndex.get(task.id);
    if (taskLayer === undefined) continue;

    for (const depId of task.dependsOn) {
      const depLayer = layerIndex.get(depId);
      if (depLayer === undefined) continue;

      if (depLayer >= taskLayer) {
        return [depId, task.id];
      }
    }
  }

  return null;
};

export const detectRuleBasedConflicts = (
  tasks: TaskNode[],
  layers: TaskNode[][],
): TaskConflict[] => {
  const conflicts: TaskConflict[] = [];

  // 1. Cycle detection
  const cycle = detectCycle(tasks);
  if (cycle) {
    conflicts.push({
      description: `检测到循环依赖，任务 ${cycle[0]} 和 ${cycle[1]} 互相依赖`,
      severity: "error",
      tasks: cycle,
      type: "circular_dependency",
    });
  }

  // 2. Ordering violations
  const ordering = detectOrderingViolation(tasks, layers);
  if (ordering) {
    conflicts.push({
      description: `依赖排序异常：${ordering[0]} 应在 ${ordering[1]} 之前执行，但位于同一层或之后`,
      severity: "error",
      tasks: ordering,
      type: "ordering_violation",
    });
  }

  // 3. Schedule overlaps within the same layer
  for (const layer of layers) {
    const scheduleTasks = layer.filter((t) => SCHEDULE_INTENTS.has(t.intent));

    for (let i = 0; i < scheduleTasks.length; i++) {
      for (let j = i + 1; j < scheduleTasks.length; j++) {
        const a = scheduleTasks[i];
        const b = scheduleTasks[j];

        if (hasTimeOverlap(a.args as DateRangeArgs, b.args as DateRangeArgs)) {
          conflicts.push({
            description: `「${a.label}」和「${b.label}」可能在同一时间段安排日程`,
            severity: "warning",
            tasks: [a.id, b.id],
            type: "schedule_overlap",
          });
        }
      }
    }
  }

  // 4. Resource write conflicts (same collection, parallel layer)
  for (const layer of layers) {
    for (let i = 0; i < layer.length; i++) {
      for (let j = i + 1; j < layer.length; j++) {
        const a = layer[i];
        const b = layer[j];
        const collA = getCollectionForIntent(a.intent);
        const collB = getCollectionForIntent(b.intent);

        if (collA && collA === collB && WRITE_INTENTS.has(a.intent) && WRITE_INTENTS.has(b.intent)) {
          const aPlanId = (a.args as { planId?: number }).planId;
          const bPlanId = (b.args as { planId?: number }).planId;

          // Only conflict if they target the same document
          if (aPlanId && bPlanId && aPlanId === bPlanId) {
            conflicts.push({
              description: `「${a.label}」和「${b.label}」同时对 ${collA} #${aPlanId} 进行写操作`,
              severity: "warning",
              tasks: [a.id, b.id],
              type: "resource_write_conflict",
            });
          }
        }
      }
    }
  }

  return conflicts;
};
