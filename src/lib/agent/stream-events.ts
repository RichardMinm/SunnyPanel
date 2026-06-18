import type { ProposedAgentAction } from "@/lib/agent/schemas";

export type AgentStreamPhase =
  | "arbitration"
  | "context"
  | "dry_run"
  | "execution"
  | "orchestration"
  | "response";

export type AgentStreamStageStatus = "done" | "error" | "queued" | "running";

export type AgentStreamStageEvent = {
  completedAt?: string;
  elapsedMs?: number;
  id: string;
  phase: AgentStreamPhase;
  startedAt: string;
  status: AgentStreamStageStatus;
  title: string;
};

export type AgentStreamProgressEvent = {
  detail?: string;
  message: string;
  stageId: string;
};

export type AgentStreamChangeEvent = {
  collections?: string[];
  riskLevel?: ProposedAgentAction["riskLevel"];
  stageId: string;
  summary: string;
};

export type AgentStreamEmitters = {
  emitChange: (event: AgentStreamChangeEvent) => void;
  emitProgress: (event: AgentStreamProgressEvent) => void;
  emitStage: (event: AgentStreamStageEvent) => void;
};

export type AgentStreamStageSeed = {
  id: string;
  phase: AgentStreamPhase;
  title: string;
};

export type AgentStreamController = {
  change: (event: AgentStreamChangeEvent) => void;
  complete: (stageId: string, title?: string) => void;
  error: (stageId: string, title?: string) => void;
  progress: (event: AgentStreamProgressEvent) => void;
  start: (stage: AgentStreamStageSeed) => void;
};

const noop = () => undefined;

export const noopAgentStreamEmitters: AgentStreamEmitters = {
  emitChange: noop,
  emitProgress: noop,
  emitStage: noop,
};

import { isRecord } from "@/lib/shared/is-record";

const stageStatuses: AgentStreamStageStatus[] = ["done", "error", "queued", "running"];
const streamPhases: AgentStreamPhase[] = [
  "arbitration",
  "context",
  "dry_run",
  "execution",
  "orchestration",
  "response",
];

export const isAgentStreamStageEvent = (value: unknown): value is AgentStreamStageEvent => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    streamPhases.includes(value.phase as AgentStreamPhase) &&
    typeof value.startedAt === "string" &&
    stageStatuses.includes(value.status as AgentStreamStageStatus) &&
    typeof value.title === "string"
  );
};

export const isAgentStreamProgressEvent = (value: unknown): value is AgentStreamProgressEvent => {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.stageId === "string" && typeof value.message === "string";
};

export const isAgentStreamChangeEvent = (value: unknown): value is AgentStreamChangeEvent => {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.stageId === "string" && typeof value.summary === "string";
};

export const createAgentStreamController = ({
  emitChange,
  emitProgress,
  emitStage,
}: AgentStreamEmitters = noopAgentStreamEmitters): AgentStreamController => {
  const stages = new Map<
    string,
    {
      phase: AgentStreamPhase;
      startedAt: string;
      startedMs: number;
      title: string;
    }
  >();

  const start = (stage: AgentStreamStageSeed) => {
    const startedMs = Date.now();
    const startedAt = new Date(startedMs).toISOString();

    stages.set(stage.id, {
      phase: stage.phase,
      startedAt,
      startedMs,
      title: stage.title,
    });

    emitStage({
      ...stage,
      startedAt,
      status: "running",
    });
  };

  const finish = (stageId: string, status: "done" | "error", title?: string) => {
    const current = stages.get(stageId);

    if (!current) {
      return;
    }

    const completedMs = Date.now();
    emitStage({
      id: stageId,
      completedAt: new Date(completedMs).toISOString(),
      elapsedMs: Math.max(0, completedMs - current.startedMs),
      phase: current.phase,
      startedAt: current.startedAt,
      status,
      title: title ?? current.title,
    });
  };

  return {
    change: emitChange,
    complete: (stageId, title) => finish(stageId, "done", title),
    error: (stageId, title) => finish(stageId, "error", title),
    progress: emitProgress,
    start,
  };
};
