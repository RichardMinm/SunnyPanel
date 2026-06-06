"use client";

import { motion } from "motion/react";

import type { AgentTraceStep } from "@/lib/agent/schemas";
import type {
  AgentStreamChangeEvent,
  AgentStreamPhase,
  AgentStreamProgressEvent,
  AgentStreamStageEvent,
} from "@/lib/agent/stream-events";

type AgentThinkingPanelProps = {
  isThinking: boolean;
  statusLabel: string;
  steps: AgentTraceStep[];
  streamChanges?: AgentStreamChangeEvent[];
  streamProgress?: AgentStreamProgressEvent[];
  streamStages?: AgentStreamStageEvent[];
  thinkingContent?: string;
};

const phaseLabelMap: Record<AgentStreamPhase, string> = {
  arbitration: "仲裁",
  context: "上下文",
  dry_run: "预检",
  execution: "执行",
  orchestration: "编排",
  response: "回复",
};

const formatElapsed = (elapsedMs?: number) => {
  if (typeof elapsedMs !== "number") {
    return "";
  }

  if (elapsedMs < 1000) {
    return `${elapsedMs}ms`;
  }

  return `${(elapsedMs / 1000).toFixed(elapsedMs < 10_000 ? 1 : 0)}s`;
};

const getVisibleStages = (streamStages: AgentStreamStageEvent[]) => {
  const runningStages = streamStages.filter((stage) => stage.status === "running");

  if (runningStages.length === 0) {
    return streamStages.slice(-4);
  }

  const runningIds = new Set(runningStages.map((stage) => stage.id));
  return [
    ...streamStages.filter((stage) => !runningIds.has(stage.id)).slice(-3),
    ...runningStages,
  ].slice(-4);
};

export function AgentThinkingPanel({
  isThinking,
  statusLabel,
  steps,
  streamChanges = [],
  streamProgress = [],
  streamStages = [],
  thinkingContent,
}: AgentThinkingPanelProps) {
  const visibleSteps = steps.slice(-4);
  const visibleStages = getVisibleStages(streamStages);
  const hasStreamFlow = visibleStages.length > 0;
  const activeStage = [...streamStages].reverse().find((stage) => stage.status === "running");
  const thinkingLines = (thinkingContent ?? "").split("\n").map((line) => line.trim()).filter(Boolean).slice(-2);

  if (!isThinking && visibleSteps.length === 0 && thinkingLines.length === 0 && !hasStreamFlow) {
    return null;
  }

  return (
    <motion.div
      className={`sunny-agent-thinking-panel${isThinking ? " is-running" : " is-complete"}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      role="status"
      aria-label="Agent 任务流"
    >
      <span className="sunny-agent-thinking-dot" aria-hidden="true" />
      <div className="sunny-agent-thinking-panel-content">
        <div className="sunny-agent-thinking-panel-header">
          <span>{activeStage ? activeStage.title : isThinking ? statusLabel : `思考完成 (${steps.length} 步)`}</span>
          {isThinking ? (
            <span className="sunny-agent-thinking-dots" aria-hidden="true">
              <span /><span /><span />
            </span>
          ) : null}
        </div>
        {hasStreamFlow ? (
          <ol className="sunny-agent-stage-list">
            {visibleStages.map((stage) => {
              const latestProgress = [...streamProgress].reverse().find((item) => item.stageId === stage.id);
              const latestChanges = streamChanges.filter((item) => item.stageId === stage.id).slice(-2);
              const elapsed = formatElapsed(stage.elapsedMs);

              return (
                <li key={stage.id} className={`sunny-agent-stage-row is-${stage.status}`}>
                  <span className="sunny-agent-stage-dot" aria-hidden="true" />
                  <div className="sunny-agent-stage-copy">
                    <div className="sunny-agent-stage-title-row">
                      <strong>{stage.title}</strong>
                      <span>{phaseLabelMap[stage.phase]}</span>
                      {elapsed ? <small>{elapsed}</small> : null}
                    </div>
                    {latestProgress ? (
                      <p>{latestProgress.detail ? `${latestProgress.message} · ${latestProgress.detail}` : latestProgress.message}</p>
                    ) : null}
                    {latestChanges.length > 0 ? (
                      <div className="sunny-agent-stage-change-list">
                        {latestChanges.map((change, index) => (
                          <span key={`${stage.id}-${change.summary}-${index}`}>
                            {change.riskLevel ? `${change.riskLevel} · ` : ""}{change.summary}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : visibleSteps.length > 0 ? (
          <ol className="sunny-agent-thinking-step-list">
            {visibleSteps.map((step) => (
              <li key={step.id} className={`sunny-agent-thinking-step is-${step.status}`}>
                <strong>{step.title}</strong>
                {step.detail ? <p>{step.detail}</p> : null}
              </li>
            ))}
          </ol>
        ) : thinkingLines.length > 0 ? (
          <div className="sunny-agent-thinking-inline-content">
            {thinkingLines.map((line, index) => (
              <p key={`${line}-${index}`}>{line}</p>
            ))}
          </div>
        ) : (
          <p className="sunny-agent-thinking-placeholder">等待 Agent 反馈...</p>
        )}
      </div>
    </motion.div>
  );
}
