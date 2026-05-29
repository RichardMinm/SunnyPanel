import type { AgentTraceStep } from "@/lib/agent/schemas";

import { traceKindLabelMap } from "./constants";

type AgentTracePanelProps = {
  statusLabel: string;
  traceSteps: AgentTraceStep[];
};

export function AgentTracePanel({ statusLabel, traceSteps }: AgentTracePanelProps) {
  if (traceSteps.length === 0) {
    return (
      <div className="sunny-agent-inspector-empty">
        <h3>等待执行 Trace</h3>
        <p>{statusLabel || "发送消息后，这里会展示意图识别、上下文构建、DryRun、确认和写入过程。"}</p>
      </div>
    );
  }

  return (
    <div className="sunny-agent-inspector-panel">
      <div className="sunny-agent-trace-panel-list">
        {traceSteps.map((step) => (
          <div key={step.id} className={`sunny-agent-run-step-v2 sunny-agent-run-step-v2-${step.status}`}>
            <span className="sunny-agent-run-step-marker" aria-hidden="true" />
            <div className="sunny-agent-run-step-content">
              <div>
                <span className={`sunny-agent-kind-pill sunny-agent-kind-${step.kind}`}>{traceKindLabelMap[step.kind]}</span>
                <small>{step.status}</small>
              </div>
              <h3>{step.title}</h3>
              {step.detail ? <p>{step.detail}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
