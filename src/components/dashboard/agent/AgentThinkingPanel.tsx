"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { AgentTraceStep } from "@/lib/agent/schemas";

type AgentThinkingPanelProps = {
  isThinking: boolean;
  statusLabel: string;
  steps: AgentTraceStep[];
};

export function AgentThinkingPanel({ isThinking, statusLabel, steps }: AgentThinkingPanelProps) {
  const [expanded, setExpanded] = useState(true);

  if (!isThinking && steps.length === 0) {
    return null;
  }

  return (
    <div className="sunny-agent-thinking-panel">
      {isThinking ? <div className="sunny-agent-shimmer-bar" /> : null}
      <div
        className="sunny-agent-thinking-panel-header"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded((v) => !v); } }}
      >
        <span className="sunny-agent-thinking-chevron" data-open={expanded ? "true" : "false"}>
          &#9654;
        </span>
        {isThinking ? (
          <>
            <span className="sunny-agent-thinking-dots">
              <span /><span /><span />
            </span>
            <span>{statusLabel}</span>
          </>
        ) : (
          <span>思考完成 ({steps.length} 步)</span>
        )}
      </div>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="body"
            className="sunny-agent-thinking-panel-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {steps.length > 0 ? (
              steps.map((step, i) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.2 }}
                  style={{ padding: "4px 0", borderBottom: "1px solid color-mix(in srgb, var(--border, #e2e8f0) 50%, transparent)" }}
                >
                  <strong style={{ fontSize: "0.82rem" }}>{step.title}</strong>
                  {step.detail ? <p style={{ margin: "2px 0 0", fontSize: "0.78rem", opacity: 0.7 }}>{step.detail}</p> : null}
                </motion.div>
              ))
            ) : (
              <p style={{ opacity: 0.5, fontSize: "0.82rem" }}>等待 Agent 反馈...</p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
