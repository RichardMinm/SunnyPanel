import type { AgentTokenUsage, AgentTraceStep } from "@/lib/agent/schemas";

import { AgentTokenMeter } from "./AgentTokenMeter";

type AgentDebugPanelProps = {
  inputTokenEstimate: number;
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
};

export function AgentDebugPanel({ inputTokenEstimate, tokenUsage, traceSteps }: AgentDebugPanelProps) {
  return (
    <div className="sunny-agent-inspector-panel">
      <AgentTokenMeter inputTokenEstimate={inputTokenEstimate} tokenUsage={tokenUsage} />
      <p className="sunny-agent-debug-trace-count">
        Trace 步数：<strong>{traceSteps.length}</strong>
      </p>
    </div>
  );
}
