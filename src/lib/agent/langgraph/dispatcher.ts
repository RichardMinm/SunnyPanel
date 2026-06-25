import type { AgentGraphRuntimeConfig } from "@/lib/agent/langgraph/config";

export type AgentRuntimeRunner<TArgs extends unknown[], TResult> = (
  ...args: TArgs
) => Promise<TResult>;

export const createAgentRuntimeRunner = <
  TArgs extends unknown[],
  TResult,
>({
  config,
  createLangGraphRunner,
  createLegacyRunner,
}: {
  config: AgentGraphRuntimeConfig;
  createLangGraphRunner: () => AgentRuntimeRunner<TArgs, TResult>;
  createLegacyRunner: () => AgentRuntimeRunner<TArgs, TResult>;
}): AgentRuntimeRunner<TArgs, TResult> => {
  let selectedRunner: AgentRuntimeRunner<TArgs, TResult> | null = null;

  return (...args) => {
    selectedRunner ??=
      config.mode === "legacy"
        ? createLegacyRunner()
        : createLangGraphRunner();

    return selectedRunner(...args);
  };
};
