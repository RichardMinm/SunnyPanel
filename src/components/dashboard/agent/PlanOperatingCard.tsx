"use client";

import type { AgentRunDetail } from "./types";

const statusLabelMap: Record<string, string> = {
  canceled: "已取消",
  failed: "阻塞",
  queued: "等待执行",
  running: "运行中",
  succeeded: "待复核",
};

const statusToneMap: Record<string, string> = {
  canceled: "is-muted",
  failed: "is-blocked",
  queued: "is-ready",
  running: "is-running",
  succeeded: "is-review",
};

type PlanOperatingCardProps = {
  debugMode: boolean;
  onRunPrompt?: (prompt: string) => void;
  run: AgentRunDetail;
};

export function PlanOperatingCard({
  debugMode,
  onRunPrompt,
  run,
}: PlanOperatingCardProps) {
  const statusLabel = statusLabelMap[run.status] ?? run.status;
  const statusTone = statusToneMap[run.status] ?? "is-muted";
  const latestStep = run.steps[0]?.message ?? "readiness-audit 已完成，等待用户复核下一步。";
  const planLabel = run.goal ?? run.title;
  const nextAction = run.nextAction ?? "复核评估建议，并选择继续推进或暂缓。";
  const continuePrompt = `继续推进这项计划：${planLabel}。请基于最近一次 Plan Operating 评估执行下一步：${nextAction}`;
  const pausePrompt = `暂缓这项计划：${planLabel}。请把计划状态调整为暂停，并记录原因：需要人工确认下一步。`;
  const reviewPrompt = `进入审阅：请复核最近一次 Plan Operating readiness-audit，并总结这项计划的状态、风险和下一步。`;

  return (
    <section
      aria-label="Plan Operating readiness-audit"
      className="sunny-plan-operating-card"
    >
      <div className="sunny-plan-operating-card-head">
        <div>
          <span>Plan Operating</span>
          <h3>{run.title}</h3>
        </div>
        <strong className={`sunny-plan-operating-state ${statusTone}`}>
          {statusLabel}
        </strong>
      </div>

      <div className="sunny-plan-operating-grid">
        <span>状态</span>
        <strong>{statusLabel}</strong>
        <span>工作流</span>
        <strong>{run.workflow || "readiness-audit"}</strong>
        <span>下一步</span>
        <strong>{nextAction}</strong>
      </div>

      {run.summary ? <p>{run.summary}</p> : null}
      {run.goal ? (
        <p>
          <span className="font-medium text-foreground">目标：</span>
          {run.goal}
        </p>
      ) : null}
      {run.impactSummary ? <small>{run.impactSummary}</small> : null}

      {onRunPrompt ? (
        <div className="sunny-plan-operating-actions" role="toolbar" aria-label="Plan Operating 操作">
          <button type="button" onClick={() => onRunPrompt(continuePrompt)}>
            继续推进
          </button>
          <button type="button" onClick={() => onRunPrompt(pausePrompt)}>
            暂缓这项计划
          </button>
          <button type="button" onClick={() => onRunPrompt(reviewPrompt)}>
            进入审阅
          </button>
        </div>
      ) : null}

      {debugMode ? (
        <details className="sunny-plan-operating-debug">
          <summary>查看 readiness-audit 日志</summary>
          <p>{latestStep}</p>
        </details>
      ) : null}
    </section>
  );
}
