export type AgentGraphRuntimeMode = "langgraph" | "legacy";

export type AgentGraphRuntimeConfig = {
  mode: AgentGraphRuntimeMode;
};

export const getAgentGraphRuntimeConfig = (
  env: Record<string, string | undefined> = process.env,
): AgentGraphRuntimeConfig => ({
  mode:
    env.AGENT_GRAPH_RUNTIME?.trim().toLowerCase() === "legacy"
      ? "legacy"
      : "langgraph",
});
