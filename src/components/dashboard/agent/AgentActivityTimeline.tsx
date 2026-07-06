"use client";

import { useMemo, useState } from "react";

import type { AgentActivityStep } from "@/lib/agent/activity";

import { AgentActivityStepItem } from "./AgentActivityStep";

type AgentActivityTimelineProps = {
  defaultExpanded?: boolean;
  maxCollapsed?: number;
  steps?: AgentActivityStep[];
};

export function AgentActivityTimeline({
  defaultExpanded = false,
  maxCollapsed = 6,
  steps = [],
}: AgentActivityTimelineProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const userSteps = useMemo(() => steps.filter((step) => step.visibility !== "developer"), [steps]);

  if (userSteps.length === 0) {
    return null;
  }

  const canCollapse = userSteps.length > maxCollapsed;
  const visibleSteps = expanded || !canCollapse ? userSteps : userSteps.slice(-maxCollapsed);
  const activeStep =
    [...visibleSteps].reverse().find((step) => step.status === "running" || step.status === "waiting") ?? null;
  const heading = activeStep ? "Agent 正在处理" : "执行过程";

  return (
    <section className="sunny-agent-activity-timeline" aria-label="Agent activity timeline">
      <div className="sunny-agent-activity-timeline-head">
        <div>
          <span>{heading}</span>
          <p>实时状态，不展示内部推理、原始日志或工具参数。</p>
        </div>
        {canCollapse ? (
          <button
            type="button"
            className="sunny-agent-activity-toggle"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "收起" : `展开全部 ${userSteps.length} 步`}
          </button>
        ) : null}
      </div>
      <div className="sunny-agent-activity-list">
        {visibleSteps.map((step) => (
          <AgentActivityStepItem
            active={activeStep?.id === step.id}
            compact
            key={step.id}
            step={step}
          />
        ))}
      </div>
    </section>
  );
}
