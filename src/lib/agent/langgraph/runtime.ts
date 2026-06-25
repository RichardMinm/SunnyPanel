import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import {
  getAgentGraphRuntimeConfig,
  type AgentGraphRuntimeConfig,
} from "@/lib/agent/langgraph/config";
import type {
  SunnyAgentGraphContext,
  SunnyAgentGraphExecution,
  SunnyAgentGraphInput,
  SunnyAgentGraphResolution,
  SunnyAgentGraphState,
} from "@/lib/agent/langgraph/state";
import type { AgentChatResponse } from "@/lib/agent/schemas";

export type SunnyAgentGraphDependencies = {
  buildContext: (
    input: SunnyAgentGraphInput,
  ) => Promise<SunnyAgentGraphContext>;
  executeRead: (args: {
    context: SunnyAgentGraphContext["context"];
    input: SunnyAgentGraphInput;
    resolution: SunnyAgentGraphResolution;
    tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  }) => Promise<SunnyAgentGraphExecution>;
  finalize: (args: {
    input: SunnyAgentGraphInput;
    response: AgentChatResponse;
  }) => Promise<AgentChatResponse>;
  resolveIntent: (args: {
    context: SunnyAgentGraphContext["context"];
    input: SunnyAgentGraphInput;
    tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  }) => Promise<SunnyAgentGraphResolution>;
};

const SunnyAgentStateAnnotation = Annotation.Root({
  context: Annotation<SunnyAgentGraphState["context"]>,
  contextSummary: Annotation<SunnyAgentGraphState["contextSummary"]>,
  execution: Annotation<SunnyAgentGraphState["execution"]>,
  input: Annotation<SunnyAgentGraphInput>,
  resolution: Annotation<SunnyAgentGraphState["resolution"]>,
  response: Annotation<SunnyAgentGraphState["response"]>,
  tokenUsage: Annotation<SunnyAgentGraphState["tokenUsage"]>,
  trace: Annotation<SunnyAgentGraphState["trace"]>({
    default: () => [],
    reducer: (left, right) => [...left, ...right],
  }),
});

export const compileSunnyAgentGraph = (
  dependencies: SunnyAgentGraphDependencies,
  _config: AgentGraphRuntimeConfig = getAgentGraphRuntimeConfig(),
) =>
  new StateGraph(SunnyAgentStateAnnotation)
    .addNode("buildContext", async (state) => {
      const result = await dependencies.buildContext(state.input);
      return {
        context: result.context,
        contextSummary: result.contextSummary,
        tokenUsage: result.tokenUsage,
        trace: [
          {
            detail: result.contextSummary,
            id: "langgraph-build-context",
            kind: "context" as const,
            status: "done" as const,
            title: "LangGraph 上下文已就绪",
          },
        ],
      };
    })
    .addNode("resolveIntent", async (state) => {
      const resolution = await dependencies.resolveIntent({
        context: state.context,
        input: state.input,
        tokenUsage: state.tokenUsage ?? state.input.baseTokenUsage,
      });

      return {
        resolution,
        tokenUsage: resolution.tokenUsage ?? state.tokenUsage,
        trace: [
          {
            detail: `intent=${resolution.intent.intent}`,
            id: "langgraph-resolve-intent",
            kind: "analysis" as const,
            status: "done" as const,
            title: "LangGraph 意图已识别",
          },
        ],
      };
    })
    .addNode("executeRead", async (state) => {
      if (!state.resolution) {
        throw new Error("LangGraph resolution is missing");
      }
      const execution = await dependencies.executeRead({
        context: state.context,
        input: state.input,
        resolution: state.resolution,
        tokenUsage: state.tokenUsage ?? state.input.baseTokenUsage,
      });
      return {
        execution,
        tokenUsage: execution.tokenUsage ?? state.tokenUsage,
        trace: [
          {
            detail: `intent=${state.resolution.intent.intent}`,
            id: "langgraph-execute-read",
            kind: "action" as const,
            status: "done" as const,
            title: "LangGraph 只读动作已执行",
          },
        ],
      };
    })
    .addNode("finalize", async (state) => {
      if (!state.execution || !state.resolution) {
        throw new Error("LangGraph execution result is missing");
      }
      const response: AgentChatResponse = {
        assistantMessage: state.execution.assistantMessage,
        confidence: state.resolution.intent.confidence,
        contextSummary: state.contextSummary,
        engine: state.resolution.engine,
        intent: state.resolution.intent.intent,
        lastRollbackPayload: state.execution.lastRollbackPayload,
        pendingAction: state.execution.pendingAction,
        threadId: state.input.threadId,
        tokenUsage:
          state.execution.tokenUsage ??
          state.tokenUsage ??
          state.input.baseTokenUsage,
        trace: state.trace,
      };
      return {
        response: await dependencies.finalize({
          input: state.input,
          response,
        }),
      };
    })
    .addEdge(START, "buildContext")
    .addEdge("buildContext", "resolveIntent")
    .addEdge("resolveIntent", "executeRead")
    .addEdge("executeRead", "finalize")
    .addEdge("finalize", END)
    .compile();

export const runSunnyAgentGraph = async (
  input: SunnyAgentGraphInput,
  dependencies: SunnyAgentGraphDependencies,
  config?: AgentGraphRuntimeConfig,
) => {
  const state = await compileSunnyAgentGraph(dependencies, config).invoke({
    input,
    trace: [],
  });

  if (!state.response) {
    throw new Error("LangGraph did not produce a response");
  }

  return state.response;
};
