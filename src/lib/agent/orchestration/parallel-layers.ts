import type { TaskNode } from "./types";

export type ParallelLayersResult = {
  layers: TaskNode[][];
  orphanedTaskIds: string[];
};

export const groupTasksIntoParallelLayers = (tasks: TaskNode[]): ParallelLayersResult => {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const remaining = new Set(tasks.map((task) => task.id));
  const completed = new Set<string>();
  const layers: TaskNode[][] = [];

  while (remaining.size > 0) {
    const layer = [...remaining]
      .map((id) => byId.get(id))
      .filter((task): task is TaskNode => Boolean(task))
      .filter((task) => task.dependsOn.every((dependency) => completed.has(dependency)));

    if (layer.length === 0) {
      break;
    }

    for (const task of layer) {
      remaining.delete(task.id);
      completed.add(task.id);
    }

    layers.push(layer);
  }

  return {
    layers,
    orphanedTaskIds: [...remaining],
  };
};
