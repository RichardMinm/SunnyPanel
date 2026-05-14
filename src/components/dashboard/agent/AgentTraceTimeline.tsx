import { AgentRunTimeline, type AgentRunTimelineProps } from "./AgentRunTimeline";

export type AgentTraceTimelineProps = AgentRunTimelineProps;

/** 执行轨迹时间线（与 `AgentRunTimeline` 同一实现，便于命名与 Dashboard 文档对齐）。 */
export function AgentTraceTimeline(props: AgentTraceTimelineProps) {
  return <AgentRunTimeline {...props} />;
}
