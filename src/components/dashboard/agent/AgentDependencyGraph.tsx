"use client";

import { useMemo } from "react";
import type { TaskNode } from "@/lib/agent/orchestration/types";

type AgentDependencyGraphProps = {
  completedTasks: Set<string>;
  conflictTasks: [string, string][];
  executingTaskId: null | string;
  failedTasks: Set<string>;
  tasks: TaskNode[];
};

const ROLE_ICONS: Record<string, string> = {
  content: "📝",
  memory: "🧠",
  plan: "📋",
  query: "🔍",
  review: "📊",
  schedule: "📅",
};

const NODE_HEIGHT = 56;
const NODE_WIDTH = 180;
const LAYER_GAP = 80;
const NODE_GAP = 20;

type LayeredNode = TaskNode & { layer: number; order: number };

const computeLayers = (tasks: TaskNode[]): LayeredNode[] => {
  const layerMap = new Map<string, number>();
  let remaining = [...tasks];
  let currentLayer = 0;

  while (remaining.length > 0) {
    const depSatisfied = remaining.filter((t) =>
      t.dependsOn.every((depId) => {
        const depLayer = layerMap.get(depId);
        return depLayer !== undefined && depLayer < currentLayer;
      }),
    );

    if (depSatisfied.length === 0) {
      // Resolve any remaining by treating them as roots
      for (const t of remaining) {
        layerMap.set(t.id, currentLayer);
      }
      break;
    }

    for (const t of depSatisfied) {
      layerMap.set(t.id, currentLayer);
    }

    remaining = remaining.filter((t) => !depSatisfied.some((ds) => ds.id === t.id));
    currentLayer += 1;
  }

  const byLayer = new Map<number, TaskNode[]>();

  for (const task of tasks) {
    const layer = layerMap.get(task.id) ?? 0;
    const arr = byLayer.get(layer) ?? [];
    arr.push(task);
    byLayer.set(layer, arr);
  }

  const result: LayeredNode[] = [];

  for (const [layer, layerTasks] of [...byLayer.entries()].sort(([a], [b]) => a - b)) {
    for (let i = 0; i < layerTasks.length; i++) {
      result.push({ ...layerTasks[i], layer, order: i });
    }
  }

  return result;
};

export function AgentDependencyGraph({
  completedTasks,
  conflictTasks,
  executingTaskId,
  failedTasks,
  tasks,
}: AgentDependencyGraphProps) {
  const layered = useMemo(() => computeLayers(tasks), [tasks]);
  const maxLayer = Math.max(...layered.map((n) => n.layer), 0);

  const conflictSet = useMemo(() => {
    const set = new Set<string>();

    for (const [a, b] of conflictTasks) {
      set.add(`${a}-${b}`);
      set.add(`${b}-${a}`);
    }

    return set;
  }, [conflictTasks]);

  if (tasks.length === 0) {
    return (
      <div className="text-sm text-muted p-4">
        暂无编排任务，发送复合请求后在此查看执行图。
      </div>
    );
  }

  const svgWidth = (maxLayer + 1) * (NODE_WIDTH + LAYER_GAP) + NODE_GAP * 2;
  const maxNodesPerLayer = Math.max(
    ...Array.from({ length: maxLayer + 1 }, (_, i) => layered.filter((n) => n.layer === i).length),
  );
  const svgHeight = maxNodesPerLayer * (NODE_HEIGHT + NODE_GAP) + NODE_GAP * 2;

  // Map node IDs to positions
  const positions = new Map<string, { x: number; y: number }>();

  for (const node of layered) {
    const layerNodes = layered.filter((n) => n.layer === node.layer);
    const nodesInLayer = layerNodes.length;
    const layerWidth = nodesInLayer * (NODE_HEIGHT + NODE_GAP);
    const startY = (svgHeight - layerWidth) / 2 + NODE_GAP;
    const orderInLayer = layerNodes.findIndex((n) => n.id === node.id);

    positions.set(node.id, {
      x: node.layer * (NODE_WIDTH + LAYER_GAP) + LAYER_GAP / 2,
      y: startY + orderInLayer * (NODE_HEIGHT + NODE_GAP),
    });
  }

  const getStatusClass = (nodeId: string) => {
    if (failedTasks.has(nodeId)) return "failed";
    if (executingTaskId === nodeId) return "executing";
    if (completedTasks.has(nodeId)) return "completed";

    return "pending";
  };

  return (
    <div className="sunny-agent-dag-container">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ width: "100%", height: "auto", maxHeight: "400px" }}
      >
        {/* Dependency arrows */}
        {tasks.map((task) =>
          task.dependsOn.map((depId) => {
            const from = positions.get(depId);
            const to = positions.get(task.id);

            if (!from || !to) return null;

            const isConflict = conflictSet.has(`${task.id}-${depId}`);

            return (
              <line
                key={`${depId}-${task.id}`}
                x1={from.x + NODE_WIDTH}
                y1={from.y + NODE_HEIGHT / 2}
                x2={to.x}
                y2={to.y + NODE_HEIGHT / 2}
                stroke={isConflict ? "#ef4444" : "#94a3b8"}
                strokeWidth={isConflict ? 2 : 1}
                strokeDasharray={isConflict ? "5,5" : undefined}
                markerEnd="url(#arrowhead)"
              />
            );
          }),
        )}

        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto">
            <polygon points="0 0, 6 3, 0 6" fill="#94a3b8" />
          </marker>
        </defs>

        {/* Task nodes */}
        {tasks.map((task) => {
          const pos = positions.get(task.id);
          if (!pos) return null;

          const status = getStatusClass(task.id);
          const icon = ROLE_ICONS[task.agentRole] ?? "⚙️";

          return (
            <g key={task.id}>
              <rect
                x={pos.x}
                y={pos.y}
                width={NODE_WIDTH}
                height={NODE_HEIGHT}
                rx={6}
                className={`sunny-dag-node sunny-dag-node-${status}`}
                fill={
                  status === "completed" ? "#22c55e" :
                  status === "failed" ? "#ef4444" :
                  status === "executing" ? "#3b82f6" :
                  "#e2e8f0"
                }
                fillOpacity={
                  status === "pending" ? 0.5 : 0.15
                }
                stroke={
                  status === "completed" ? "#16a34a" :
                  status === "failed" ? "#dc2626" :
                  status === "executing" ? "#2563eb" :
                  "#94a3b8"
                }
                strokeWidth={status === "executing" ? 2 : 1}
              />
              <text
                x={pos.x + 8}
                y={pos.y + 20}
                fontSize={12}
                fontWeight={600}
                fill="#1e293b"
              >
                {icon} {task.label.slice(0, 16)}
                {task.label.length > 16 ? "..." : ""}
              </text>
              <text
                x={pos.x + 8}
                y={pos.y + 40}
                fontSize={10}
                fill="#64748b"
              >
                {task.intent} · {task.agentRole}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
