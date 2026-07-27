import {
  Annotation,
  END,
  interrupt,
  START,
  StateGraph,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";

import type { StructuredConfirmation } from "@/lib/agent/chat-pipeline/confirmation-step";
import { buildLangGraphFailureResponse } from "@/lib/agent/langgraph/failure-response";
import type {
  CompoundGraphInterrupt,
  compileMountedOrchestrationSubgraph,
} from "@/lib/agent/langgraph/orchestration-subgraph";
import type {
  SunnyAgentGraphContext,
  SunnyAgentGraphInput,
  SunnyAgentGraphResolution,
} from "@/lib/agent/langgraph/state";
import type {
  AgentChatResponse,
  AgentIntent,
  AgentTraceStep,
} from "@/lib/agent/schemas";
import type { OrchestratorPlan } from "@/lib/agent/orchestration/types";
import type { ExecutionGraphResult } from "@/lib/agent/orchestration/types";

export type FullGraphResponseOutcome = {
  response: AgentChatResponse;
  type: "response";
};

export type FullGraphOrchestrationOutcome =
  | FullGraphResponseOutcome
  | {
      response: AgentChatResponse;
      type: "cancelled";
    }
  | {
      plan: OrchestratorPlan;
      tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
      type: "compound";
    }
  | {
      orchestratorPlanSource?: "heuristic" | "llm" | null;
      preResolvedIntent: AgentIntent | null;
      tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
      type: "continue";
    };

export type FullGraphResolutionOutcome =
  | FullGraphResponseOutcome
  | {
      batchExecuteIntents?: AgentIntent[];
      confirmedActionId?: null | string;
      nextPendingAfterExecute?: AgentChatResponse["pendingAction"];
      resolution: SunnyAgentGraphResolution;
      tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
      type: "continue";
    };

export type FullGraphDryRunOutcome =
  | FullGraphResponseOutcome
  | {
      approvedActionId?: string;
      conversationState?: unknown;
      executionApproved: boolean;
      isDirectAnswer: boolean;
      tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
      type: "continue";
    };

export type FullSunnyAgentGraphDependencies = {
  buildContext: (args: {
    input: SunnyAgentGraphInput;
  }) => Promise<SunnyAgentGraphContext>;
  dryRun: (args: {
    context: unknown;
    input: SunnyAgentGraphInput;
    resolutionData: Extract<
      FullGraphResolutionOutcome,
      { type: "continue" }
    >;
    resolution: SunnyAgentGraphResolution;
    tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  }) => Promise<FullGraphDryRunOutcome>;
  execute: (args: {
    context: unknown;
    dryRun: Extract<FullGraphDryRunOutcome, { type: "continue" }>;
    input: SunnyAgentGraphInput;
    resolutionData: Extract<
      FullGraphResolutionOutcome,
      { type: "continue" }
    >;
    resolution: SunnyAgentGraphResolution;
    tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  }) => Promise<AgentChatResponse>;
  finalizeCompound?: (args: {
    context: unknown;
    input: SunnyAgentGraphInput;
    plan: OrchestratorPlan;
    result: ExecutionGraphResult;
    tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  }) => Promise<AgentChatResponse>;
  finalize: (args: {
    input: SunnyAgentGraphInput;
    response: AgentChatResponse;
  }) => Promise<AgentChatResponse>;
  orchestrate: (args: {
    config: RunnableConfig;
    context: unknown;
    input: SunnyAgentGraphInput;
    tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  }) => Promise<FullGraphOrchestrationOutcome>;
  resolveIntent: (args: {
    context: unknown;
    input: SunnyAgentGraphInput;
    orchestratorPlanSource: "heuristic" | "llm" | null;
    preResolvedIntent: AgentIntent | null;
    tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  }) => Promise<FullGraphResolutionOutcome>;
};

export type FullGraphResumeInput = {
  baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  message: string;
  structuredConfirmation: null | StructuredConfirmation;
  turnId: string;
};

type FullSunnyAgentGraphState = {
  cancelled: boolean;
  compoundPlan: null | OrchestratorPlan;
  compoundResult: ExecutionGraphResult | null;
  context: null | unknown;
  contextSummary: null | string;
  dryRunData: Extract<FullGraphDryRunOutcome, { type: "continue" }> | null;
  failureMessage: null | string;
  input: SunnyAgentGraphInput;
  orchestratorPlanSource: "heuristic" | "llm" | null;
  preResolvedIntent: AgentIntent | null;
  resolution: SunnyAgentGraphResolution | null;
  resolutionData: Extract<
    FullGraphResolutionOutcome,
    { type: "continue" }
  > | null;
  response: AgentChatResponse | null;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  trace: AgentTraceStep[];
};

const StateAnnotation = Annotation.Root({
  cancelled: Annotation<FullSunnyAgentGraphState["cancelled"]>({
    default: () => false,
    reducer: (_left, right) => right,
  }),
  compoundPlan: Annotation<
    FullSunnyAgentGraphState["compoundPlan"]
  >,
  compoundResult: Annotation<
    FullSunnyAgentGraphState["compoundResult"]
  >,
  context: Annotation<FullSunnyAgentGraphState["context"]>,
  contextSummary: Annotation<FullSunnyAgentGraphState["contextSummary"]>,
  dryRunData: Annotation<FullSunnyAgentGraphState["dryRunData"]>,
  failureMessage: Annotation<FullSunnyAgentGraphState["failureMessage"]>,
  input: Annotation<FullSunnyAgentGraphState["input"]>,
  orchestratorPlanSource: Annotation<
    FullSunnyAgentGraphState["orchestratorPlanSource"]
  >,
  preResolvedIntent: Annotation<
    FullSunnyAgentGraphState["preResolvedIntent"]
  >,
  resolution: Annotation<FullSunnyAgentGraphState["resolution"]>,
  resolutionData: Annotation<FullSunnyAgentGraphState["resolutionData"]>,
  response: Annotation<FullSunnyAgentGraphState["response"]>,
  tokenUsage: Annotation<FullSunnyAgentGraphState["tokenUsage"]>,
  trace: Annotation<FullSunnyAgentGraphState["trace"]>({
    default: () => [],
    reducer: (_left, right) => right,
  }),
});

const appendTrace = (
  trace: AgentTraceStep[],
  step: AgentTraceStep,
): AgentTraceStep[] => [...trace, step];

const routeResponse = (state: FullSunnyAgentGraphState) =>
  state.response?.pendingAction ? "await_user" : "finalize";

const toFailureUpdate = (error: unknown) => {
  const msg = error instanceof Error ? error.message : String(error);
  return { failureMessage: msg };
};

export const compileFullSunnyAgentGraph = (
  dependencies: FullSunnyAgentGraphDependencies,
  options: {
    checkpointer: BaseCheckpointSaver;
    compoundSubgraph: ReturnType<
      typeof compileMountedOrchestrationSubgraph
    >;
  },
) => {
  const compoundSubgraph = options.compoundSubgraph;

  return new StateGraph(StateAnnotation)
    .addNode("build_context", async (state) => {
      try {
        const result = await dependencies.buildContext({
          input: state.input,
        });

        return {
          context: result.context,
          contextSummary: result.contextSummary,
          tokenUsage: result.tokenUsage,
          trace: appendTrace(state.trace, {
            detail: result.contextSummary,
            id: "langgraph-build-context",
            kind: "context",
            status: "done",
            title: "LangGraph 上下文已就绪",
          }),
        };
      } catch (error) {
        return toFailureUpdate(error);
      }
    })
    .addNode("orchestrate_plan", async (state, config) => {
      try {
        const result = await dependencies.orchestrate({
          config,
          context: state.context,
          input: state.input,
          tokenUsage: state.tokenUsage,
        });

        if (result.type === "response") {
          return {
            response: result.response,
            tokenUsage: result.response.tokenUsage ?? state.tokenUsage,
          };
        }

        if (result.type === "cancelled") {
          return {
            cancelled: true,
            response: result.response,
            tokenUsage: result.response.tokenUsage ?? state.tokenUsage,
          };
        }

        if (result.type === "compound") {
          return {
            compoundPlan: result.plan,
            tokenUsage: result.tokenUsage,
          };
        }

        return {
          orchestratorPlanSource: result.orchestratorPlanSource ?? null,
          preResolvedIntent: result.preResolvedIntent,
          tokenUsage: result.tokenUsage,
        };
      } catch (error) {
        return toFailureUpdate(error);
      }
    })
    .addNode("compound_subgraph", compoundSubgraph as never)
    .addNode("finalize_compound", async (state) => {
      try {
        if (!state.compoundPlan || !state.compoundResult) {
          throw new Error(
            "LangGraph compound result is missing before finalization.",
          );
        }

        if (!dependencies.finalizeCompound) {
          throw new Error(
            "LangGraph compound finalizer dependency is missing.",
          );
        }

        const response = await dependencies.finalizeCompound({
          context: state.context,
          input: state.input,
          plan: state.compoundPlan,
          result: state.compoundResult,
          tokenUsage: state.tokenUsage,
        });

        return {
          response,
          tokenUsage: response.tokenUsage ?? state.tokenUsage,
          trace: appendTrace(state.trace, {
            detail: `tasks=${state.compoundPlan.tasks.length}`,
            id: "langgraph-compound-subgraph",
            kind: "action",
            status: "done",
            title: "LangGraph 复合子图已完成",
          }),
        };
      } catch (error) {
        return toFailureUpdate(error);
      }
    })
    .addNode("resolve_intent", async (state) => {
      try {
        const result = await dependencies.resolveIntent({
          context: state.context,
          input: state.input,
          orchestratorPlanSource: state.orchestratorPlanSource,
          preResolvedIntent: state.preResolvedIntent,
          tokenUsage: state.tokenUsage,
        });

        if (result.type === "response") {
          return {
            response: result.response,
            tokenUsage: result.response.tokenUsage ?? state.tokenUsage,
          };
        }

        return {
          resolution: result.resolution,
          resolutionData: result,
          tokenUsage: result.tokenUsage,
          trace: appendTrace(state.trace, {
            detail: `intent=${result.resolution.intent.intent}`,
            id: "langgraph-resolve-intent",
            kind: "analysis",
            status: "done",
            title: "LangGraph 意图已识别",
          }),
        };
      } catch (error) {
        return toFailureUpdate(error);
      }
    })
    .addNode("dry_run", async (state) => {
      try {
        if (!state.resolution || !state.resolutionData) {
          throw new Error(
            "LangGraph resolution is missing before dry-run.",
          );
        }

        const result = await dependencies.dryRun({
          context: state.context,
          input: state.input,
          resolutionData: state.resolutionData,
          resolution: state.resolution,
          tokenUsage: state.tokenUsage,
        });

        if (result.type === "response") {
          return {
            response: result.response,
            tokenUsage: result.response.tokenUsage ?? state.tokenUsage,
          };
        }

        return {
          dryRunData: result,
          tokenUsage: result.tokenUsage,
        };
      } catch (error) {
        return toFailureUpdate(error);
      }
    })
    .addNode("execute", async (state) => {
      try {
        if (
          !state.resolution ||
          !state.resolutionData ||
          !state.dryRunData
        ) {
          throw new Error("LangGraph execution inputs are missing.");
        }

        const response = await dependencies.execute({
          context: state.context,
          dryRun: state.dryRunData,
          input: state.input,
          resolutionData: state.resolutionData,
          resolution: state.resolution,
          tokenUsage: state.tokenUsage,
        });

        return {
          response,
          tokenUsage: response.tokenUsage ?? state.tokenUsage,
          trace: appendTrace(state.trace, {
            detail: `intent=${state.resolution.intent.intent}`,
            id: "langgraph-execute",
            kind: "action",
            status: "done",
            title: "LangGraph 动作已执行",
          }),
        };
      } catch (error) {
        return toFailureUpdate(error);
      }
    })
    .addNode("refresh_evaluate", (state) => {
      try {
        if (!state.response) {
          throw new Error(
            "LangGraph response is missing before refresh/evaluate.",
          );
        }

        return {
          response: state.response,
          trace: appendTrace(state.trace, {
            detail: `intent=${state.response.intent} pending=${state.response.pendingAction?.type ?? "none"}`,
            id: "langgraph-refresh-evaluate",
            kind: "analysis",
            status: "done",
            title: "LangGraph 执行结果已刷新并评估",
          }),
        };
      } catch (error) {
        return toFailureUpdate(error);
      }
    })
    .addNode("await_user", (state) => {
      if (!state.response?.pendingAction) {
        throw new Error("LangGraph await_user requires pending work.");
      }

      const resume = interrupt<
        AgentChatResponse,
        FullGraphResumeInput
      >(state.response);

      return {
        context: null,
        contextSummary: null,
        compoundPlan: null,
        compoundResult: null,
        dryRunData: null,
        failureMessage: null,
        cancelled: false,
        input: {
          ...state.input,
          baseTokenUsage: resume.baseTokenUsage,
          message: resume.message,
          pendingAction: state.response.pendingAction,
          structuredConfirmation: resume.structuredConfirmation,
          turnId: resume.turnId,
        },
        orchestratorPlanSource: null,
        preResolvedIntent: null,
        resolution: null,
        resolutionData: null,
        response: null,
        tokenUsage: resume.baseTokenUsage,
        trace: [],
      };
    })
    .addNode("finalize", async (state) => {
      if (!state.response) {
        throw new Error("LangGraph response is missing before finalize.");
      }

      const response = await dependencies.finalize({
        input: state.input,
        response: {
          ...state.response,
          contextSummary:
            state.response.contextSummary ??
            state.contextSummary ??
            undefined,
          threadId: state.response.threadId ?? state.input.threadId,
          trace: state.response.trace ?? state.trace,
        },
      });

      return { response };
    })
    .addNode("failure", (state) => ({
      response: buildLangGraphFailureResponse({
        baseTokenUsage:
          state.tokenUsage ?? state.input.baseTokenUsage,
        error: new Error(
          state.failureMessage ?? "Unknown LangGraph node failure",
        ),
        pendingAction: state.input.pendingAction,
        threadId: state.input.threadId,
      }),
    }))
    .addEdge(START, "build_context")
    .addConditionalEdges(
      "build_context",
      (state) =>
        state.failureMessage ? "failure" : "orchestrate_plan",
      ["failure", "orchestrate_plan"],
    )
    .addConditionalEdges(
      "orchestrate_plan",
      (state) =>
        state.failureMessage
          ? "failure"
          : state.cancelled
            ? END
          : state.response
            ? routeResponse(state)
            : state.compoundPlan
              ? "compound_subgraph"
            : "resolve_intent",
      [
        "await_user",
        "compound_subgraph",
        "failure",
        "finalize",
        "resolve_intent",
        END,
      ],
    )
    .addConditionalEdges(
      "compound_subgraph",
      (state) =>
        state.failureMessage
          ? "failure"
          : state.compoundResult
            ? "finalize_compound"
            : "failure",
      ["failure", "finalize_compound"],
    )
    .addConditionalEdges(
      "finalize_compound",
      (state) =>
        state.failureMessage
          ? "failure"
          : state.response
            ? routeResponse(state)
            : "failure",
      ["await_user", "failure", "finalize"],
    )
    .addConditionalEdges(
      "resolve_intent",
      (state) =>
        state.failureMessage
          ? "failure"
          : state.response
            ? routeResponse(state)
            : "dry_run",
      ["await_user", "dry_run", "failure", "finalize"],
    )
    .addConditionalEdges(
      "dry_run",
      (state) =>
        state.failureMessage
          ? "failure"
          : state.response
            ? routeResponse(state)
            : "execute",
      ["await_user", "execute", "failure", "finalize"],
    )
    .addConditionalEdges(
      "execute",
      (state) =>
        state.failureMessage ? "failure" : "refresh_evaluate",
      ["failure", "refresh_evaluate"],
    )
    .addConditionalEdges(
      "refresh_evaluate",
      (state) =>
        state.failureMessage ? "failure" : routeResponse(state),
      ["await_user", "failure", "finalize"],
    )
    .addEdge("await_user", "build_context")
    .addEdge("failure", "finalize")
    .addEdge("finalize", END)
    .compile({ checkpointer: options.checkpointer });
};

export const getInterruptedAgentResponse = (
  result: unknown,
): AgentChatResponse | null => {
  if (!result || typeof result !== "object") {
    return null;
  }

  const interrupts = (
    result as {
      __interrupt__?: Array<{ value?: unknown }>;
    }
  ).__interrupt__;
  const value = interrupts?.[0]?.value;

  return value &&
    typeof value === "object" &&
    "assistantMessage" in value &&
    "pendingAction" in value
    ? (value as AgentChatResponse)
    : null;
};

export const getInterruptedCompoundResult = (
  result: unknown,
): CompoundGraphInterrupt | null => {
  if (!result || typeof result !== "object") {
    return null;
  }

  const interrupts = (
    result as {
      __interrupt__?: Array<{ value?: unknown }>;
    }
  ).__interrupt__;
  const value = interrupts?.[0]?.value;

  return value &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "compound_pending" &&
    "plan" in value &&
    "result" in value
    ? (value as CompoundGraphInterrupt)
    : null;
};
