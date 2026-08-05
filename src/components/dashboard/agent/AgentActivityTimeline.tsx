"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { AgentActivityStep } from "@/lib/agent/activity";

import { DashboardIcon } from "../icons";
import { useDashboardMotion } from "../motion/dashboard-motion";
import { AgentActivityStepItem } from "./AgentActivityStep";

type AgentActivityTimelineProps = {
  defaultExpanded?: boolean;
  steps?: AgentActivityStep[];
};

export function AgentActivityTimeline({
  defaultExpanded = false,
  steps = [],
}: AgentActivityTimelineProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { agentDisclosureView } = useDashboardMotion();
  const userSteps = useMemo(() => steps.filter((step) => step.visibility !== "developer"), [steps]);

  if (userSteps.length === 0) {
    return null;
  }

  const activeStep =
    [...userSteps].reverse().find((step) => step.status === "running" || step.status === "waiting") ?? null;
  const heading = activeStep
    ? `Sunny 正在处理 · ${activeStep.title}`
    : `处理过程 · ${userSteps.length} 步`;

  return (
    <section
      className={`sunny-agent-activity-timeline${expanded ? " is-expanded" : " is-collapsed"}`}
      aria-label="Sunny 处理过程"
    >
      <button
        aria-expanded={expanded}
        className="sunny-agent-activity-summary-button"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <span className="sunny-agent-activity-summary">{heading}</span>
        <span className="sunny-agent-activity-toggle">
          {expanded ? "收起" : "展开"}
          <span
            aria-hidden="true"
            className={`sunny-agent-activity-chevron${expanded ? " is-expanded" : ""}`}
          >
            <DashboardIcon name="chevronDown" />
          </span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            animate={agentDisclosureView.animate}
            className="sunny-agent-activity-list"
            exit={agentDisclosureView.exit}
            initial={agentDisclosureView.initial}
            key="activity-list"
            transition={agentDisclosureView.transition}
          >
            {userSteps.map((step) => (
              <AgentActivityStepItem
                active={activeStep?.id === step.id}
                compact
                key={step.id}
                step={step}
              />
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
