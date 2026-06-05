import { AsyncLocalStorage } from "node:async_hooks";

export type AgentExecutionContext = {
  userId?: number;
};

const agentExecutionContext = new AsyncLocalStorage<AgentExecutionContext>();

export const runWithAgentExecutionContext = <T>(
  context: AgentExecutionContext,
  callback: () => Promise<T>,
) => agentExecutionContext.run(context, callback);

export const getCurrentAgentExecutionContext = () => agentExecutionContext.getStore() ?? {};

export const getCurrentAgentUserId = () => getCurrentAgentExecutionContext().userId;

