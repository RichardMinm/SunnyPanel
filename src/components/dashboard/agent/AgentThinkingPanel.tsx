"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";

import type { AgentTraceStep } from "@/lib/agent/schemas";
import type {
  AgentStreamChangeEvent,
  AgentStreamPhase,
  AgentStreamProgressEvent,
  AgentStreamStageEvent,
} from "@/lib/agent/stream-events";
import { useDashboardMotion } from "../motion/dashboard-motion";

type AgentThinkingPanelProps = {
  isThinking: boolean;
  statusLabel: string;
  steps: AgentTraceStep[];
  debugMode?: boolean;
  streamChanges?: AgentStreamChangeEvent[];
  streamProgress?: AgentStreamProgressEvent[];
  streamStages?: AgentStreamStageEvent[];
  thinkingContent?: string;
};

/* ── user-facing step type ── */

type UserStep = {
  id: string;
  label: string;
  status: "done" | "pending" | "running";
};

/* ── mapping: raw stages → user-friendly labels ── */

function mapStagesToUserSteps(
  stages: AgentStreamStageEvent[],
  changes: AgentStreamChangeEvent[],
): UserStep[] {
  const steps: UserStep[] = [];
  const titles = stages.map((s) => s.title).join(" ");
  const hasRunning = stages.some((s) => s.status === "running");
  const allDone = stages.length > 0 && stages.every((s) => s.status === "done");
  const hasChanges = changes.length > 0;
  const hasDryRun = stages.some((s) => s.phase === "dry_run");
  const hasHighRisk = changes.some((c) => c.riskLevel === "high");

  // Step 1: Intent recognized
  const hasIntent = /识别为/.test(titles);
  steps.push({
    id: "intent",
    label: "已理解请求",
    status: hasIntent ? "done" : hasRunning ? "running" : "pending",
  });

  // Step 2: Context loaded
  const hasContext = /上下文/.test(titles);
  steps.push({
    id: "context",
    label: "已读取相关上下文",
    status: hasContext ? "done" : hasIntent && hasRunning && !hasContext ? "running" : hasIntent ? "done" : "pending",
  });

  // Step 3: Pre-check for write operations (only if applicable)
  if (hasDryRun || hasChanges) {
    steps.push({
      id: "precheck",
      label: hasHighRisk ? "⚠️ 写入预检（高风险）" : "写入预检",
      status: hasDryRun ? "done" : hasRunning ? "running" : "pending",
    });
  }

  // Step 4: Generating response / plan
  const hasGeneration = /生成/.test(titles) || /回复/.test(titles) || /回答/.test(titles);
  const isQueryOnly = !hasDryRun && !hasChanges;
  steps.push({
    id: "generate",
    label: isQueryOnly ? "正在生成回答" : "正在生成执行方案",
    status: hasGeneration ? "done" : allDone && !hasGeneration ? "done" : hasRunning ? "running" : "pending",
  });

  // Step 5: Awaiting confirmation (only if there are changes pending)
  if (hasChanges && !allDone) {
    const hasConfirmation = /确认/.test(titles) || /安全提示/.test(titles);
    steps.push({
      id: "confirm",
      label: "等待你的确认",
      status: hasConfirmation ? "done" : "running",
    });
  }

  // Mark completion
  if (allDone) {
    // Mark all steps as done
    return steps.map((s) => ({ ...s, status: "done" as const }));
  }

  return steps;
}

/* ── derive safety notice from stage data ── */

function getSafetyNotice(
  stages: AgentStreamStageEvent[],
  changes: AgentStreamChangeEvent[],
): string | null {
  const titles = stages.map((s) => s.title).join(" ");
  const isAborted = /阻止/.test(titles);
  if (isAborted) return null; // don't show notice when already cancelled

  const hasHighRisk = changes.some((c) => c.riskLevel === "high");
  const hasMediumRisk = changes.some((c) => c.riskLevel === "medium");
  const isDelete = /删除/.test(changes.map((c) => c.summary).join(" "));
  const isModify = /修改|更新/.test(changes.map((c) => c.summary).join(" "));
  const hasDryRun = stages.some((s) => s.phase === "dry_run");
  const allDone = stages.length > 0 && stages.every((s) => s.status === "done");

  if (allDone) return null;
  if (!hasDryRun && changes.length === 0) return null;

  if (isDelete) {
    return "⚠️ 此操作涉及删除数据，不可撤销，必须你手动确认后才会执行";
  }
  if (hasHighRisk) {
    return "⚠️ 此操作风险较高，不会自动执行，需要你仔细确认";
  }
  if (hasMediumRisk && isModify) {
    return "⚠️ 修改前会展示变更内容，需要你确认后才会写入";
  }
  if (hasDryRun) {
    return "💡 本次操作不会自动写入，需要你确认后才会执行";
  }

  return null;
}

function isQueryOnly(stages: AgentStreamStageEvent[], changes: AgentStreamChangeEvent[]): boolean {
  return stages.every((s) => s.phase === "context" || s.phase === "arbitration" || s.phase === "response") &&
    changes.length === 0 &&
    !stages.some((s) => s.phase === "dry_run" || s.phase === "execution");
}

/* ── helpers ── */

const phaseLabelMap: Record<AgentStreamPhase, string> = {
  arbitration: "仲裁",
  context: "上下文",
  dry_run: "预检",
  execution: "执行",
  orchestration: "编排",
  response: "回复",
};

const formatElapsed = (elapsedMs?: number) => {
  if (typeof elapsedMs !== "number") return "";
  if (elapsedMs < 1000) return `${elapsedMs}ms`;
  return `${(elapsedMs / 1000).toFixed(elapsedMs < 10_000 ? 1 : 0)}s`;
};

/* ── component ── */

export function AgentThinkingPanel({
  isThinking,
  statusLabel,
  steps,
  debugMode = false,
  streamChanges = [],
  streamProgress = [],
  streamStages = [],
  thinkingContent,
}: AgentThinkingPanelProps) {
  const { messageView, prefersReducedMotion } = useDashboardMotion();
  const [debugOpen, setDebugOpen] = useState(false);

  const userSteps = useMemo(
    () => mapStagesToUserSteps(streamStages, streamChanges),
    [streamStages, streamChanges],
  );

  const safetyNotice = useMemo(
    () => getSafetyNotice(streamStages, streamChanges),
    [streamStages, streamChanges],
  );

  const isQuery = useMemo(
    () => isQueryOnly(streamStages, streamChanges),
    [streamStages, streamChanges],
  );

  const activeStage = [...streamStages].reverse().find((s) => s.status === "running");
  const thinkingLines = (thinkingContent ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(-2);
  const hasStreamFlow = streamStages.length > 0;
  const hasDebugData = hasStreamFlow || steps.length > 0 || thinkingLines.length > 0;

  if (!isThinking && userSteps.length === 0 && thinkingLines.length === 0 && !hasStreamFlow) {
    return null;
  }

  const statusIcon = (status: UserStep["status"]) => {
    if (status === "done") return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{flexShrink:0}}>
        <path d="m5 11 3.5 3.5 6.5-6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
    if (status === "running") return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{flexShrink:0}}>
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
    return (
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true" style={{flexShrink:0}}>
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  };

  return (
    <motion.div
      className={`sunny-agent-progress-panel${isThinking ? " is-running" : " is-complete"}`}
      initial={prefersReducedMotion ? messageView.initial : { opacity: 0, y: 6 }}
      animate={messageView.animate}
      transition={{ duration: messageView.transition.duration }}
      role="status"
      aria-label="Sunny 正在处理"
    >
      {/* ── header ── */}
      <div className="sunny-agent-progress-header">
        <span className="sunny-agent-progress-dot" aria-hidden="true" />
        <span className="sunny-agent-progress-title">
          {activeStage
            ? "Sunny 正在处理"
            : isThinking
              ? statusLabel
              : `处理完成 (${userSteps.length} 步)`}
        </span>
        {isThinking ? (
          <span className="sunny-agent-thinking-dots" aria-hidden="true">
            <span /><span /><span />
          </span>
        ) : null}
      </div>

      <div className="sunny-agent-progress-body">
        {/* ── Layer 1: User-friendly steps ── */}
        {userSteps.length > 0 && (
          <ol className="sunny-agent-user-step-list">
            {userSteps.map((step) => (
              <li
                key={step.id}
                className={`sunny-agent-user-step is-${step.status}`}
              >
                <span className={`sunny-agent-user-step-icon is-${step.status}`} aria-hidden>
                  {statusIcon(step.status)}
                </span>
                <span className="sunny-agent-user-step-label">{step.label}</span>
              </li>
            ))}
          </ol>
        )}

        {/* ── FAQ / Query notice ── */}
        {isQuery && streamStages.length > 0 && streamStages.every((s) => s.status === "done") && (
          <div className="sunny-agent-progress-notice is-info">
            💬 本次只是功能咨询，不会修改或删除任何数据
          </div>
        )}

        {/* ── Safety notice ── */}
        {safetyNotice && (
          <div className="sunny-agent-progress-notice is-warning">
            {safetyNotice}
          </div>
        )}

        {/* ── Thinking content (streaming) ── */}
        {thinkingLines.length > 0 && (
          <div className="sunny-agent-thinking-inline-content">
            {thinkingLines.map((line, i) => (
              <p key={`${line.slice(0, 20)}-${i}`}>{line}</p>
            ))}
          </div>
        )}

        {/* ── Layer 2: Debug details (collapsible) ── */}
        {debugMode && hasDebugData && (
          <details
            className="sunny-agent-progress-debug"
            open={debugOpen}
            onToggle={(e) => setDebugOpen(e.currentTarget.open)}
          >
            <summary>调试信息</summary>
            <div className="sunny-agent-progress-debug-body">
              {/* Stream stages */}
              {hasStreamFlow && (
                <div className="sunny-agent-progress-debug-section">
                  <h4>流程阶段</h4>
                  <ol className="sunny-agent-stage-list">
                    {streamStages.map((stage) => {
                      const latestProgress = [...streamProgress].reverse().find((p) => p.stageId === stage.id);
                      const latestChanges = streamChanges.filter((c) => c.stageId === stage.id).slice(-2);
                      const elapsed = formatElapsed(stage.elapsedMs);

                      return (
                        <li key={stage.id} className={`sunny-agent-stage-row is-${stage.status}`}>
                          <span className="sunny-agent-stage-dot" aria-hidden />
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
                                {latestChanges.map((change, ci) => (
                                  <span key={`${stage.id}-${change.summary}-${ci}`}>
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
                </div>
              )}

              {/* Trace steps */}
              {steps.length > 0 && (
                <div className="sunny-agent-progress-debug-section">
                  <h4>Trace ({steps.length} 步)</h4>
                  <ol className="sunny-agent-thinking-step-list">
                    {steps.map((step) => (
                      <li key={step.id} className={`sunny-agent-thinking-step is-${step.status}`}>
                        <strong>{step.title}</strong>
                        {step.detail ? <p>{step.detail}</p> : null}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </motion.div>
  );
}
