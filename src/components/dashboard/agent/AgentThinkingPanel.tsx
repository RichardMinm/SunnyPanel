"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";

import type {
  AgentStreamChangeEvent,
  AgentStreamStageEvent,
} from "@/lib/agent/stream-events";
import { useDashboardMotion } from "../motion/dashboard-motion";

type AgentThinkingPanelProps = {
  active: boolean;
  statusLabel: string;
  streamChanges?: AgentStreamChangeEvent[];
  streamStages?: AgentStreamStageEvent[];
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
  if (stages.length === 0 && changes.length === 0) {
    return [];
  }

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

/* ── component ── */

export function AgentThinkingPanel({
  active,
  statusLabel,
  streamChanges = [],
  streamStages = [],
}: AgentThinkingPanelProps) {
  const { agentStatusView } = useDashboardMotion();

  const userSteps = useMemo(
    () => mapStagesToUserSteps(streamStages, streamChanges),
    [streamStages, streamChanges],
  );

  if (!active) {
    return null;
  }

  const currentStep =
    [...userSteps].reverse().find((step) => step.status === "running")
    ?? [...userSteps].reverse().find((step) => step.status === "pending")
    ?? userSteps.at(-1);
  const currentLabel = currentStep?.label ?? statusLabel;

  return (
    <motion.div
      className="sunny-agent-progress-panel is-running is-compact"
      animate={agentStatusView.animate}
      exit={agentStatusView.exit}
      initial={agentStatusView.initial}
      transition={agentStatusView.transition}
      role="status"
      aria-label="Sunny 正在处理"
    >
      <div className="sunny-agent-progress-header">
        <span className="sunny-agent-progress-dot" aria-hidden="true" />
        <span className="sunny-agent-progress-title">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              animate={agentStatusView.animate}
              exit={agentStatusView.exit}
              initial={agentStatusView.initial}
              key={currentLabel}
              transition={agentStatusView.transition}
            >
              {currentLabel}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="sunny-agent-thinking-dots" aria-hidden="true">
          <span /><span /><span />
        </span>
      </div>
    </motion.div>
  );
}
