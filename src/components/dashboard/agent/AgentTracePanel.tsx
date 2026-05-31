"use client";

import type { AgentTraceStep } from "@/lib/agent/schemas";
import { traceKindLabelMap } from "./constants";

type AgentTracePanelProps = {
  traceSteps: AgentTraceStep[];
  statusLabel: string;
};

const defaultTraceLabels = [
  "识别意图",
  "构建上下文",
  "拆解任务",
  "调用工具",
  "生成 DryRun",
  "等待确认",
  "执行写入",
  "记录结果",
];

export function AgentTracePanel({ traceSteps, statusLabel }: AgentTracePanelProps) {
  const hasTrace = traceSteps.length > 0;

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider">执行追踪</p>
        <span className="text-xs text-muted">{statusLabel}</span>
      </div>
      {hasTrace ? (
        <ol className="space-y-1.5">
          {traceSteps.map((step, i) => (
            <li key={step.id ?? i} className="flex items-start gap-2 text-sm">
              <span className="shrink-0 mt-0.5 text-xs font-medium text-muted">{i + 1}.</span>
              <div>
                <span className="font-medium text-foreground">
                  {traceKindLabelMap[step.kind] ?? step.kind}
                </span>
                {step.detail ? (
                  <p className="text-xs text-muted">{step.detail}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="space-y-1.5">
          {defaultTraceLabels.map((label, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-muted">
              <span className="text-xs">{i + 1}.</span>
              <span>{label}</span>
            </div>
          ))}
          <p className="text-xs text-muted mt-2">
            执行 Agent 任务时会在此显示实时步骤追踪。
          </p>
        </div>
      )}
    </div>
  );
}
