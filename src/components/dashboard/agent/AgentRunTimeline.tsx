"use client";

import { AnimatePresence, motion } from "motion/react";

import type { AgentChatMessage, AgentTraceStep } from "@/lib/agent/schemas";

import { AgentThinkingPanel } from "./AgentThinkingPanel";
import { traceKindLabelMap } from "./constants";

type AgentToolCallCardProps = {
  step: AgentTraceStep;
};

function AgentToolCallCard({ step }: AgentToolCallCardProps) {
  if (step.kind !== "action" && step.kind !== "write") {
    return null;
  }

  return (
    <div className="sunny-agent-tool-call-card-v2">
      <span>{step.kind === "write" ? "write_tool" : "agent_action"}</span>
      <strong>{step.title}</strong>
    </div>
  );
}

function StepStatusMarker({ status }: { status: AgentTraceStep["status"] }) {
  if (status === "done") {
    return <span className="sunny-agent-run-step-marker sunny-agent-trace-marker-done" aria-hidden="true">&#10003;</span>;
  }

  if (status === "error") {
    return <span className="sunny-agent-run-step-marker sunny-agent-trace-marker-error" aria-hidden="true">&#10007;</span>;
  }

  return <span className="sunny-agent-run-step-marker" aria-hidden="true" />;
}

export type AgentRunTimelineProps = {
  isThinking: boolean;
  latestAssistantMessage?: AgentChatMessage;
  statusLabel: string;
  steps: AgentTraceStep[];
};

export function AgentRunTimeline({ isThinking, latestAssistantMessage, statusLabel, steps }: AgentRunTimelineProps) {
  const emptyTitle = isThinking ? "正在建立请求" : "等待新任务";
  const emptyDescription = isThinking
    ? "服务端 trace 返回后，这里会展开上下文、工具调用和写入过程。"
    : "默认只显示执行过程。完整对话放在 Conversation 里。";
  const summaryContent = !isThinking ? latestAssistantMessage?.content.trim() : "";

  return (
    <section className="sunny-agent-run-surface">
      <div className="sunny-agent-run-surface-head">
        <div>
          <p>Run Timeline</p>
          <h2>执行过程</h2>
        </div>
        <span className={`sunny-agent-live-pill-v2 ${isThinking ? "active" : ""}`}>
          <i aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      <AgentThinkingPanel isThinking={isThinking} statusLabel={statusLabel} steps={steps} />

      {summaryContent ? (
        <div className="sunny-agent-run-summary">
          <span>Summary</span>
          <p>{summaryContent}</p>
        </div>
      ) : null}

      <div className="sunny-agent-run-list-v2">
        <AnimatePresence initial={false}>
          {steps.length > 0 ? (
            steps.map((step, index) => (
              <motion.div
                key={step.id}
                className={`sunny-agent-run-step-v2 sunny-agent-run-step-v2-${step.status} ${step.status === "error" ? "sunny-agent-trace-step-error" : ""}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06, duration: 0.22 }}
              >
                <StepStatusMarker status={step.status} />
                <div className="sunny-agent-run-step-content">
                  <div>
                    <span className={`sunny-agent-kind-pill sunny-agent-kind-${step.kind}`}>{traceKindLabelMap[step.kind]}</span>
                    <small>{step.status}</small>
                  </div>
                  <h3>{step.title}</h3>
                  {step.detail ? <p>{step.detail}</p> : null}
                  <AgentToolCallCard step={step} />
                </div>
              </motion.div>
            ))
          ) : (
            <motion.div
              key="empty"
              className="sunny-agent-run-empty-v2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <span className={isThinking ? "live" : ""} aria-hidden="true" />
              <div>
                <h3>{emptyTitle}</h3>
                <p>{emptyDescription}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
