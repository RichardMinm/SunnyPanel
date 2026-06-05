"use client";

import { motion } from "motion/react";

import type { AgentTraceStep } from "@/lib/agent/schemas";

type AgentThinkingPanelProps = {
  isThinking: boolean;
  statusLabel: string;
  steps: AgentTraceStep[];
  thinkingContent?: string;
};

export function AgentThinkingPanel({ isThinking, statusLabel, steps, thinkingContent }: AgentThinkingPanelProps) {
  const visibleSteps = steps.slice(-4);
  const thinkingLines = (thinkingContent ?? "").split("\n").map((line) => line.trim()).filter(Boolean).slice(-2);

  if (!isThinking && visibleSteps.length === 0 && thinkingLines.length === 0) {
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
          <span>{isThinking ? statusLabel : `思考完成 (${steps.length} 步)`}</span>
          {isThinking ? (
            <span className="sunny-agent-thinking-dots" aria-hidden="true">
              <span /><span /><span />
            </span>
          ) : null}
        </div>
        {visibleSteps.length > 0 ? (
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
