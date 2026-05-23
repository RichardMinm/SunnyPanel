/** Dashboard Agent 工作台模式；与 UI 对齐并传入 chat API。 */
export type AgentWorkbenchMode = "ask" | "execute" | "plan" | "review" | "timeline";

const validModes = new Set<AgentWorkbenchMode>(["ask", "execute", "plan", "review", "timeline"]);

export function isValidWorkbenchMode(value: unknown): value is AgentWorkbenchMode {
  return typeof value === "string" && validModes.has(value as AgentWorkbenchMode);
}
