import {
  Annotation,
  END,
  interrupt,
  Send,
  START,
  StateGraph,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";

import {
  createAgentBus,
  type AgentBusMessage,
  type AgentBusState,
} from "@/lib/agent/agents/bus";
import { groupTasksIntoParallelLayers } from "@/lib/agent/orchestration/parallel-layers";
import type {
  AgentExecutionStrategy,
  AgentTaskObservation,
  ExecutionGraphResult,
  OrchestratorPlan,
  TaskNode,
} from "@/lib/agent/orchestration/types";
import type {
  AgentIntent,
  AgentQueueResumePendingAction,
  PendingAction,
  ProposedAgentAction,
} from "@/lib/agent/schemas";
import type { AgentToolDryRunContext } from "@/lib/agent/tool-registry";
import type { AgentIntentExecutor } from "@/lib/agent/executor";
import type { AutoApprovalContext } from "@/lib/agent/safety";
import type { AgentPromptContext } from "@/lib/agent/prompts";
import {
  buildExecutionEvaluation,
} from "@/lib/agent/orchestration/evaluation";
import { buildExecutionLoopDirective } from "@/lib/agent/orchestration/loop-directive";
import {
  buildTaskObservation,
  summarizeExecutionQueue,
} from "@/lib/agent/orchestration/observations";
import {
  getSafeExecutionFailure,
  projectSafeExecutionFailure,
} from "@/lib/agent/orchestration/safe-execution-failure";
import {
  buildResumedOrchestratorPlan,
  buildStrategyResumePendingAction,
  buildStrategyResumeOrchestratorPlan,
} from "@/lib/agent/orchestration/resume-contract";
import {
  isCancellationReply,
  isConfirmationReply,
} from "@/lib/agent/intent-resolution";
import {
  createNativeOrchestrationTaskExecutor,
  type NativeOrchestrationTaskExecutorOptions,
} from "@/lib/agent/orchestration/native-task-executor";
import {
  replanAfterTaskFailure,
  type ReplanInput,
  type ReplanResult,
} from "@/lib/agent/orchestration/replan";
import { buildToolFailureRepairPlan } from "@/lib/agent/orchestration/tool-failure-repair";
import type { SunnyAgentGraphInput } from "@/lib/agent/langgraph/state";
import { COMPOUND_GRAPH_NODES } from "@/lib/agent/langgraph/topology";
import type { StructuredConfirmation } from "@/lib/agent/chat-pipeline/confirmation-step";
import {
  confirmationMatchesBatchPending,
  confirmationMatchesPending,
} from "@/lib/agent/chat-pipeline/confirmation-step";
import type { AgentChatResponse, AgentTraceStep } from "@/lib/agent/schemas";
import type { ModelCallBudgetRecorder } from "@/lib/agent/orchestration/model-call-budget";
import {
  autoArchiveStrategyFeedbackMemory,
  type StrategyFeedbackMemoryInput,
} from "@/lib/agent/orchestration/strategy-feedback";

type ExecuteOrchestrationGraphOptions = {
  autoApproval?: AutoApprovalContext;
  checkpointer?: BaseCheckpointSaver;
  disableToolFailureRepair?: boolean;
  disabledLoopDirectiveModes?: AgentExecutionStrategy["mode"][];
  executeAction?: NativeOrchestrationTaskExecutorOptions["executeAction"];
  executeIntent?: AgentIntentExecutor;
  executeRollback?: (args: {
    actionId: string;
    intent: AgentIntent["intent"];
    rollbackPayload: unknown;
  }) => Promise<unknown>;
  maxTasksPerRun?: number;
  message?: string;
  modelCallRecorder?: ModelCallBudgetRecorder;
  orchestrationId?: string;
  promptContext?: AgentPromptContext;
  recordAutoApproval?: NativeOrchestrationTaskExecutorOptions["recordAutoApproval"];
  recordStrategyFeedbackMemory?: (
    input: StrategyFeedbackMemoryInput,
  ) => Promise<unknown>;
  runnableConfig?: RunnableConfig;
  replanAttempts?: number;
  replanTaskFailure?: (input: ReplanInput) => Promise<ReplanResult>;
  toolRepairAttempts?: number;
};

type OrchestrationGraphTransition =
  | OrchestratorPlan
  | { pausedResult: ExecutionGraphResult };

export type OrchestrationSubgraphNode =
  | "collect"
  | "evaluate"
  | "execute_layer"
  | "prepare"
  | "select_ready";

export type PreparedOrchestrationTask = {
  kind: "proposal" | "read" | "write";
  payload?: unknown;
  task: TaskNode;
};

export type OrchestrationTaskOutcome = {
  assistantMessage: string;
  busMessages?: AgentBusMessage[];
  observation: AgentTaskObservation;
  pendingAction?: null | PendingAction;
  proposal?: ProposedAgentAction;
  rollbackPayload?: unknown;
  stopBeforeWrites?: boolean;
  taskId: string;
};

export type NativeOrchestrationSubgraphState = {
  bus: AgentBusState;
  compoundPlan: null | OrchestratorPlan;
  compoundResult: ExecutionGraphResult | null;
  compensationAttempted: boolean;
  compensationIndeterminate: boolean;
  compensationMessages: string[];
  context: null | unknown;
  currentLayer: TaskNode[];
  failureMessage: null | string;
  input: SunnyAgentGraphInput | null;
  layerIndex: number;
  layers: TaskNode[][];
  outcomes: OrchestrationTaskOutcome[];
  plan: OrchestratorPlan;
  preparedTasks: PreparedOrchestrationTask[];
  processedBaseline: number;
  readQueue: PreparedOrchestrationTask[];
  repairAttempts: number;
  replanAttempts: number;
  resumeRoute:
    | "advance_layer"
    | "execute_write_task"
    | "prepare"
    | "publish_result"
    | "select_ready";
  route: "complete" | "replan";
  taskCatalog: TaskNode[];
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]> | null;
  trace: AgentTraceStep[];
  writeQueue: PreparedOrchestrationTask[];
};

export type CompoundGraphResumeInput = {
  baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  message: string;
  structuredConfirmation: null | StructuredConfirmation;
  turnId: string;
};

export type CompoundGraphInterrupt = {
  plan: OrchestratorPlan;
  result: ExecutionGraphResult;
  type: "compound_pending";
};

export type NativeOrchestrationSubgraphDependencies = {
  compensate?: (args: {
    outcomes: OrchestrationTaskOutcome[];
    state: NativeOrchestrationSubgraphState;
  }) => Promise<{
    indeterminate: boolean;
    messages: string[];
  }>;
  executePreparedTask: (args: {
    bus: AgentBusState;
    context?: unknown;
    input?: SunnyAgentGraphInput;
    outcomes: OrchestrationTaskOutcome[];
    plan: OrchestratorPlan;
    prepared: PreparedOrchestrationTask;
  }) => Promise<OrchestrationTaskOutcome>;
  executeConfirmedAction?: (args: {
    action: ProposedAgentAction;
    bus: AgentBusState;
    context?: unknown;
    input?: SunnyAgentGraphInput;
    outcomes: OrchestrationTaskOutcome[];
    plan: OrchestratorPlan;
    task: TaskNode;
  }) => Promise<OrchestrationTaskOutcome>;
  prepareTask: (args: {
    bus: AgentBusState;
    context?: unknown;
    input?: SunnyAgentGraphInput;
    outcomes: OrchestrationTaskOutcome[];
    plan: OrchestratorPlan;
    task: TaskNode;
  }) => Promise<PreparedOrchestrationTask>;
  repair?: (args: {
    failedObservation: AgentTaskObservation;
    state: NativeOrchestrationSubgraphState;
  }) => Promise<OrchestratorPlan | null>;
  replan?: (args: {
    failedObservation: AgentTaskObservation;
    state: NativeOrchestrationSubgraphState;
  }) => Promise<OrchestrationGraphTransition | null>;
};

const mergeOutcomes = (
  left: OrchestrationTaskOutcome[],
  right: OrchestrationTaskOutcome[],
) => {
  const byTask = new Map(left.map((outcome) => [outcome.taskId, outcome]));

  for (const outcome of right) {
    byTask.set(outcome.taskId, outcome);
  }

  return [...byTask.values()];
};

const NativeStateAnnotation = Annotation.Root({
  bus: Annotation<NativeOrchestrationSubgraphState["bus"]>({
    default: createAgentBus,
    reducer: (_left, right) => right,
  }),
  compoundPlan: Annotation<
    NativeOrchestrationSubgraphState["compoundPlan"]
  >({
    default: () => null,
    reducer: (_left, right) => right,
  }),
  compoundResult: Annotation<
    NativeOrchestrationSubgraphState["compoundResult"]
  >({
    default: () => null,
    reducer: (_left, right) => right,
  }),
  compensationAttempted: Annotation<
    NativeOrchestrationSubgraphState["compensationAttempted"]
  >({
    default: () => false,
    reducer: (_left, right) => right,
  }),
  compensationIndeterminate: Annotation<
    NativeOrchestrationSubgraphState["compensationIndeterminate"]
  >({
    default: () => false,
    reducer: (_left, right) => right,
  }),
  compensationMessages: Annotation<
    NativeOrchestrationSubgraphState["compensationMessages"]
  >({
    default: () => [],
    reducer: (_left, right) => right,
  }),
  context: Annotation<NativeOrchestrationSubgraphState["context"]>({
    default: () => null,
    reducer: (_left, right) => right,
  }),
  currentLayer: Annotation<
    NativeOrchestrationSubgraphState["currentLayer"]
  >({
    default: () => [],
    reducer: (_left, right) => right,
  }),
  failureMessage: Annotation<
    NativeOrchestrationSubgraphState["failureMessage"]
  >({
    default: () => null,
    reducer: (_left, right) => right,
  }),
  input: Annotation<NativeOrchestrationSubgraphState["input"]>({
    default: () => null,
    reducer: (_left, right) => right,
  }),
  layerIndex: Annotation<
    NativeOrchestrationSubgraphState["layerIndex"]
  >({
    default: () => 0,
    reducer: (_left, right) => right,
  }),
  layers: Annotation<NativeOrchestrationSubgraphState["layers"]>({
    default: () => [],
    reducer: (_left, right) => right,
  }),
  outcomes: Annotation<
    NativeOrchestrationSubgraphState["outcomes"]
  >({
    default: () => [],
    reducer: mergeOutcomes,
  }),
  plan: Annotation<NativeOrchestrationSubgraphState["plan"]>,
  preparedTasks: Annotation<
    NativeOrchestrationSubgraphState["preparedTasks"]
  >({
    default: () => [],
    reducer: (_left, right) => right,
  }),
  processedBaseline: Annotation<
    NativeOrchestrationSubgraphState["processedBaseline"]
  >({
    default: () => 0,
    reducer: (_left, right) => right,
  }),
  readQueue: Annotation<
    NativeOrchestrationSubgraphState["readQueue"]
  >({
    default: () => [],
    reducer: (_left, right) => right,
  }),
  repairAttempts: Annotation<
    NativeOrchestrationSubgraphState["repairAttempts"]
  >({
    default: () => 0,
    reducer: (_left, right) => right,
  }),
  replanAttempts: Annotation<
    NativeOrchestrationSubgraphState["replanAttempts"]
  >({
    default: () => 0,
    reducer: (_left, right) => right,
  }),
  resumeRoute: Annotation<
    NativeOrchestrationSubgraphState["resumeRoute"]
  >({
    default: () => COMPOUND_GRAPH_NODES.PUBLISH_RESULT,
    reducer: (_left, right) => right,
  }),
  route: Annotation<NativeOrchestrationSubgraphState["route"]>({
    default: () => "complete",
    reducer: (_left, right) => right,
  }),
  taskCatalog: Annotation<
    NativeOrchestrationSubgraphState["taskCatalog"]
  >({
    default: () => [],
    reducer: (_left, right) => right,
  }),
  tokenUsage: Annotation<
    NativeOrchestrationSubgraphState["tokenUsage"]
  >({
    default: () => null,
    reducer: (_left, right) => right,
  }),
  trace: Annotation<NativeOrchestrationSubgraphState["trace"]>({
    default: () => [],
    reducer: (_left, right) => right,
  }),
  writeQueue: Annotation<
    NativeOrchestrationSubgraphState["writeQueue"]
  >({
    default: () => [],
    reducer: (_left, right) => right,
  }),
});

const appendBusMessages = (
  bus: AgentBusState,
  outcomes: OrchestrationTaskOutcome[],
): AgentBusState => {
  const messages = outcomes.flatMap((outcome) => outcome.busMessages ?? []);

  if (messages.length === 0) {
    return bus;
  }

  return {
    messages: [...bus.messages, ...messages].slice(-50),
  };
};

const hasConfirmationBoundary = (
  outcomes: OrchestrationTaskOutcome[],
) =>
  outcomes.some(
    (outcome) =>
      outcome.stopBeforeWrites === true ||
      outcome.pendingAction != null ||
      (outcome.proposal != null &&
        (outcome.proposal.requiresConfirmation !== false ||
          outcome.proposal.riskLevel !== "low")),
  );

const closeSupersededProposalOutcomes = (
  outcomes: OrchestrationTaskOutcome[],
  failedTaskId: string,
  repairedByTaskId: string,
  suffix: string,
) =>
  outcomes.map((outcome) => ({
    ...outcome,
    pendingAction: null,
    proposal: undefined,
    stopBeforeWrites: false,
    observation:
      outcome.taskId === failedTaskId
        ? {
            ...outcome.observation,
            message: `${outcome.observation.message} ${suffix}`,
            repairedByTaskId,
          }
        : outcome.observation,
  }));

const buildMountedResultOptions = (
  state: NativeOrchestrationSubgraphState,
): ExecuteOrchestrationGraphOptions => ({
  message: state.input?.message ?? "",
  orchestrationId: state.input
    ? `orch-${state.input.turnId}`
    : undefined,
  promptContext:
    state.context &&
    typeof state.context === "object"
      ? (state.context as AgentPromptContext)
      : undefined,
});

const resolveGraphResultOptions = (
  state: NativeOrchestrationSubgraphState,
  overrides?: ExecuteOrchestrationGraphOptions,
): ExecuteOrchestrationGraphOptions => {
  const mounted = buildMountedResultOptions(state);

  return {
    ...mounted,
    ...overrides,
    message: overrides?.message ?? mounted.message,
    orchestrationId:
      overrides?.orchestrationId ?? mounted.orchestrationId,
    promptContext:
      overrides?.promptContext ?? mounted.promptContext,
  };
};

const getResumeSignals = (
  pendingAction: PendingAction,
  resume: CompoundGraphResumeInput,
) => {
  const structured = resume.structuredConfirmation;

  if (pendingAction.type === "await_confirmation") {
    const matches =
      structured != null &&
      confirmationMatchesPending(pendingAction, structured);

    return {
      cancel:
        (matches && structured.type === "cancel") ||
        isCancellationReply(resume.message),
      confirm:
        (matches && structured.type === "confirm") ||
        isConfirmationReply(resume.message),
    };
  }

  if (pendingAction.type === "await_batch_confirmation") {
    const matches =
      structured != null &&
      confirmationMatchesBatchPending(pendingAction, structured);

    return {
      cancel:
        (matches && structured.type === "cancel") ||
        isCancellationReply(resume.message),
      confirm:
        (matches && structured.type === "confirm") ||
        isConfirmationReply(resume.message),
    };
  }

  return {
    cancel: isCancellationReply(resume.message),
    confirm: isConfirmationReply(resume.message),
  };
};

const buildCanceledCompoundResult = (
  result: ExecutionGraphResult,
): ExecutionGraphResult => ({
  ...result,
  assistantMessage: "已取消这次复合任务，未继续执行待确认或延后的写入。",
  evaluation: {
    ...result.evaluation,
    action: "complete",
    nextStep: "等待新的用户请求。",
    reason: "用户取消了复合任务恢复。",
    summary: "复合任务已取消。",
  },
  pendingAction: null,
  proposals: [],
});

const compileNativeOrchestrationGraph = (
  dependencies: NativeOrchestrationSubgraphDependencies,
  options: {
    checkpointer?: BaseCheckpointSaver;
    disabledLoopDirectiveModes?: AgentExecutionStrategy["mode"][];
    maxTasksPerRun?: number;
    mounted?: boolean;
    recordStrategyFeedbackMemory?: (
      input: StrategyFeedbackMemoryInput,
    ) => Promise<unknown>;
    resultOptions?: ExecuteOrchestrationGraphOptions;
  } = {},
) =>
  new StateGraph(NativeStateAnnotation)
    .addNode(COMPOUND_GRAPH_NODES.PREPARE, (state) => {
      const plan = state.compoundPlan ?? state.plan;

      if (!plan) {
        throw new Error("复合子图缺少可执行计划。");
      }

      const { layers, orphanedTaskIds } = groupTasksIntoParallelLayers(
        plan.tasks,
      );

      if (orphanedTaskIds.length > 0) {
        throw new Error(
          `复合任务无法生成可执行层：${orphanedTaskIds.join("、")}`,
        );
      }

      return {
        currentLayer: [],
        layers,
        plan,
        preparedTasks: [],
        processedBaseline: state.outcomes.length,
        readQueue: [],
        route: "complete" as const,
        taskCatalog:
          state.taskCatalog.length > 0
            ? state.taskCatalog
            : plan.tasks,
        writeQueue: [],
      };
    })
    .addNode(COMPOUND_GRAPH_NODES.SELECT_READY, async (state) => {
      const layer = state.layers[state.layerIndex] ?? [];
      const remainingBudget =
        typeof options.maxTasksPerRun === "number"
          ? Math.max(
              0,
              options.maxTasksPerRun -
                (state.outcomes.length -
                  state.processedBaseline),
            )
          : layer.length;
      const currentLayer = layer.slice(0, remainingBudget);
      const preparedTasks = await Promise.all(
        currentLayer.map((task) =>
          dependencies.prepareTask({
            bus: state.bus,
            context: state.context ?? undefined,
            input: state.input ?? undefined,
            outcomes: state.outcomes,
            plan: state.plan,
            task,
          }),
        ),
      );

      return {
        currentLayer,
        preparedTasks,
        readQueue: preparedTasks.filter(
          (prepared) => prepared.kind !== "write",
        ),
        writeQueue: preparedTasks.filter(
          (prepared) => prepared.kind === "write",
        ),
      };
    })
    .addNode(COMPOUND_GRAPH_NODES.EXECUTE_READ_TASK, async (state) => {
      const prepared = state.preparedTasks[0];

      if (!prepared) {
        throw new Error("复合子图缺少待执行的只读任务。");
      }

      return {
        outcomes: [
          await dependencies.executePreparedTask({
            bus: state.bus,
            context: state.context ?? undefined,
            input: state.input ?? undefined,
            outcomes: state.outcomes,
            plan: state.plan,
            prepared,
          }),
        ],
      };
    })
    .addNode(COMPOUND_GRAPH_NODES.EXECUTE_WRITE_TASK, async (state) => {
      const [prepared, ...writeQueue] = state.writeQueue;

      if (!prepared) {
        return { writeQueue };
      }

      return {
        outcomes: [
          await dependencies.executePreparedTask({
            bus: state.bus,
            context: state.context ?? undefined,
            input: state.input ?? undefined,
            outcomes: state.outcomes,
            plan: state.plan,
            prepared,
          }),
        ],
        writeQueue,
      };
    })
    .addNode(COMPOUND_GRAPH_NODES.COLLECT, (state) => {
      const currentIds = new Set(
        state.currentLayer.map((task) => task.id),
      );
      const currentOutcomes = state.outcomes.filter((outcome) =>
        currentIds.has(outcome.taskId),
      );

      return {
        bus: appendBusMessages(state.bus, currentOutcomes),
      };
    })
    .addNode(COMPOUND_GRAPH_NODES.ADVANCE_LAYER, (state) => {
      const layer = state.layers[state.layerIndex] ?? [];
      const hasBudgetRemainder =
        state.currentLayer.length < layer.length;

      return {
        currentLayer: [],
        layerIndex: hasBudgetRemainder
          ? state.layerIndex
          : state.layerIndex + 1,
        layers: hasBudgetRemainder
          ? state.layers.map((candidate, index) =>
              index === state.layerIndex
                ? candidate.slice(state.currentLayer.length)
                : candidate,
            )
          : state.layers,
        preparedTasks: [],
        readQueue: [],
        writeQueue: [],
      };
    })
    .addNode(COMPOUND_GRAPH_NODES.EVALUATE, async (state) => {
      const order = new Map(
        state.taskCatalog.map((task, index) => [task.id, index]),
      );
      const outcomes = [...state.outcomes].sort(
        (left, right) =>
          (order.get(left.taskId) ?? 0) -
          (order.get(right.taskId) ?? 0),
      );
      const failedObservation = outcomes
        .map((outcome) => outcome.observation)
        .find((observation) =>
          !observation.repairedByTaskId &&
          ["blocked", "failed"].includes(
            observation.status,
          ),
        );

      if (failedObservation && dependencies.replan) {
        const resultOptions = resolveGraphResultOptions(
          state,
          options.resultOptions,
        );
        const currentResult = buildNativeResult(
          { ...state, outcomes },
          resultOptions,
        );
        const evaluation = buildExecutionEvaluation({
          canReplan: true,
          context: resultOptions.promptContext,
          observations: currentResult.observations,
          pendingAction: currentResult.pendingAction,
          proposals: currentResult.proposals,
          queueState: currentResult.queueState,
        });
        const directive = buildExecutionLoopDirective(evaluation);
        const disabledModes = new Set(
          options.disabledLoopDirectiveModes ?? [],
        );
        const resumingAlternateStrategy =
          state.input?.pendingAction?.type === "await_strategy_resume";

        if (
          directive.action === "pause_for_user" &&
          !disabledModes.has(evaluation.strategy.mode) &&
          !resumingAlternateStrategy
        ) {
          const pendingAction = buildStrategyResumePendingAction({
            evaluation,
            message: resultOptions.message ?? "",
            orchestrationId:
              resultOptions.orchestrationId ?? `orch-${Date.now()}`,
            plan: state.plan,
          });

          if (pendingAction) {
            await (
              options.recordStrategyFeedbackMemory ??
              autoArchiveStrategyFeedbackMemory
            )({
              evaluation,
              observations: currentResult.observations,
              originalMessage: resultOptions.message ?? "",
            }).catch(() => undefined);

            return {
              compoundResult: {
                ...currentResult,
                assistantMessage: directive.assistantMessage,
                evaluation,
                pendingAction,
                proposals: [],
              },
              outcomes,
              route: "complete" as const,
            };
          }
        }
      }

      if (
        failedObservation &&
        dependencies.repair &&
        state.repairAttempts < 1
      ) {
        const repaired = await dependencies.repair({
          failedObservation,
          state: {
            ...state,
            outcomes,
          },
        });

        if (repaired && repaired.tasks.length > 0) {
          const existingTaskIds = new Set(
            state.taskCatalog.map((task) => task.id),
          );
          const repairTaskId = repaired.tasks[0].id;

          return {
            compoundPlan: repaired,
            currentLayer: [],
            layerIndex: 0,
            layers: [],
            outcomes: closeSupersededProposalOutcomes(
              outcomes,
              failedObservation.taskId,
              repairTaskId,
              "已转入语义修复。",
            ),
            plan: repaired,
            preparedTasks: [],
            readQueue: [],
            repairAttempts: state.repairAttempts + 1,
            route: "replan" as const,
            taskCatalog: [
              ...state.taskCatalog,
              ...repaired.tasks.filter(
                (task) => !existingTaskIds.has(task.id),
              ),
            ],
            writeQueue: [],
          };
        }
      }

      if (
        failedObservation &&
        dependencies.replan &&
        state.replanAttempts < 2
      ) {
        const replanned = await dependencies.replan({
          failedObservation,
          state: {
            ...state,
            outcomes,
          },
        });

        if (replanned && "pausedResult" in replanned) {
          return {
            compoundResult: replanned.pausedResult,
            outcomes,
            route: "complete" as const,
          };
        }

        if (replanned && replanned.tasks.length > 0) {
          const existingTaskIds = new Set(
            state.taskCatalog.map((task) => task.id),
          );
          const repairTaskId = replanned.tasks[0].id;
          const repairedOutcomes = closeSupersededProposalOutcomes(
            outcomes,
            failedObservation.taskId,
            repairTaskId,
            "已转入重规划。",
          );

          return {
            compoundPlan: replanned,
            currentLayer: [],
            layerIndex: 0,
            layers: [],
            outcomes: repairedOutcomes,
            plan: replanned,
            preparedTasks: [],
            readQueue: [],
            replanAttempts: state.replanAttempts + 1,
            route: "replan" as const,
            taskCatalog: [
              ...state.taskCatalog,
              ...replanned.tasks.filter(
                (task) => !existingTaskIds.has(task.id),
              ),
            ],
            writeQueue: [],
          };
        }
      }

      if (
        failedObservation &&
        dependencies.compensate &&
        !state.compensationAttempted
      ) {
        const rollbackOutcomes = outcomes.filter(
          (outcome) => outcome.rollbackPayload !== undefined,
        );

        if (rollbackOutcomes.length > 0) {
          const compensation = await dependencies.compensate({
            outcomes: rollbackOutcomes,
            state: {
              ...state,
              outcomes,
            },
          });

          return {
            compensationAttempted: true,
            compensationIndeterminate:
              compensation.indeterminate,
            compensationMessages: compensation.messages,
            outcomes,
            route: "complete" as const,
          };
        }
      }

      return {
        compensationAttempted:
          state.compensationAttempted ||
          Boolean(failedObservation),
        outcomes,
        route: "complete" as const,
      };
    })
    .addNode(COMPOUND_GRAPH_NODES.AWAIT_COMPOUND_USER, async (state) => {
      const result =
        state.compoundResult ??
        buildNativeResult(
          state,
          buildMountedResultOptions(state),
        );
      const pendingAction = result.pendingAction;

      if (!pendingAction) {
        return {
          compoundResult: result,
          resumeRoute: COMPOUND_GRAPH_NODES.PUBLISH_RESULT,
        };
      }

      let resume = interrupt<
        CompoundGraphInterrupt,
        CompoundGraphResumeInput
      >({
        plan: state.plan,
        result,
        type: "compound_pending",
      });
      let signals = getResumeSignals(pendingAction, resume);

      while (!signals.cancel && !signals.confirm) {
        resume = interrupt<
          CompoundGraphInterrupt,
          CompoundGraphResumeInput
        >({
          plan: state.plan,
          result,
          type: "compound_pending",
        });
        signals = getResumeSignals(pendingAction, resume);
      }

      if (signals.cancel) {
        return {
          compoundResult: buildCanceledCompoundResult(result),
          resumeRoute: COMPOUND_GRAPH_NODES.PUBLISH_RESULT,
        };
      }

      if (
        pendingAction.type === "await_confirmation" ||
        pendingAction.type === "await_batch_confirmation"
      ) {
        if (!dependencies.executeConfirmedAction) {
          throw new Error(
            "复合子图缺少确认动作执行器。",
          );
        }

        const actions =
          pendingAction.type === "await_confirmation"
            ? [pendingAction.action]
            : pendingAction.actions;
        const confirmedOutcomes: OrchestrationTaskOutcome[] = [];

        for (const action of actions) {
          const proposedOutcome = state.outcomes.find(
            (outcome) => outcome.proposal?.id === action.id,
          );
          const task = state.taskCatalog.find(
            (candidate) =>
              candidate.id === proposedOutcome?.taskId,
          );

          if (!task) {
            throw new Error(
              `无法恢复确认动作 ${action.id} 对应的复合任务。`,
            );
          }

          confirmedOutcomes.push(
            await dependencies.executeConfirmedAction({
              action,
              bus: state.bus,
              context: state.context ?? undefined,
              input: state.input ?? undefined,
              outcomes: [
                ...state.outcomes,
                ...confirmedOutcomes,
              ],
              plan: state.plan,
              task,
            }),
          );
        }

        return {
          compoundResult: null,
          outcomes: confirmedOutcomes,
          resumeRoute:
            state.writeQueue.length > 0
              ? COMPOUND_GRAPH_NODES.EXECUTE_WRITE_TASK
              : COMPOUND_GRAPH_NODES.ADVANCE_LAYER,
        };
      }

      if (
        pendingAction.type === "await_queue_resume"
      ) {
        const hasCheckpointedRemainder =
          Boolean(state.layers[state.layerIndex]?.length);
        const resumedPlan = hasCheckpointedRemainder
          ? state.plan
          : buildResumedOrchestratorPlan(pendingAction);

        return {
          compoundResult: null,
          ...(hasCheckpointedRemainder
            ? {}
            : {
                currentLayer: [],
                compoundPlan: resumedPlan,
                layerIndex: 0,
                layers: [],
                plan: resumedPlan,
                preparedTasks: [],
                readQueue: [],
                taskCatalog: [
                  ...state.taskCatalog,
                  ...resumedPlan.tasks.filter(
                    (task) =>
                      !state.taskCatalog.some(
                        (existing) =>
                          existing.id === task.id,
                      ),
                  ),
                ],
                writeQueue: [],
              }),
          processedBaseline: state.outcomes.length,
          resumeRoute:
            hasCheckpointedRemainder
              ? COMPOUND_GRAPH_NODES.SELECT_READY
              : resumedPlan.tasks.length > 0
                ? COMPOUND_GRAPH_NODES.PREPARE
                : COMPOUND_GRAPH_NODES.PUBLISH_RESULT,
        };
      }

      if (pendingAction.type === "await_strategy_resume") {
        const resumedPlan =
          buildStrategyResumeOrchestratorPlan(pendingAction);
        const repairTaskId = resumedPlan.tasks[0]?.id;

        return {
          compoundResult: null,
          compoundPlan: resumedPlan,
          currentLayer: [],
          layerIndex: 0,
          layers: [],
          outcomes: state.outcomes.map((outcome) =>
            repairTaskId &&
            !outcome.observation.repairedByTaskId &&
            ["blocked", "failed", "skipped"].includes(
              outcome.observation.status,
            )
              ? {
                  ...outcome,
                  observation: {
                    ...outcome.observation,
                    repairedByTaskId: repairTaskId,
                  },
                  pendingAction: null,
                }
              : outcome,
          ),
          plan: resumedPlan,
          preparedTasks: [],
          processedBaseline: state.outcomes.length,
          readQueue: [],
          resumeRoute:
            resumedPlan.tasks.length > 0
              ? COMPOUND_GRAPH_NODES.PREPARE
              : COMPOUND_GRAPH_NODES.PUBLISH_RESULT,
          taskCatalog: [
            ...state.taskCatalog,
            ...resumedPlan.tasks.filter(
              (task) =>
                !state.taskCatalog.some(
                  (existing) => existing.id === task.id,
                ),
            ),
          ],
          writeQueue: [],
        };
      }

      return {
        compoundResult: result,
        resumeRoute: COMPOUND_GRAPH_NODES.PUBLISH_RESULT,
      };
    })
    .addNode(COMPOUND_GRAPH_NODES.PUBLISH_RESULT, (state) => ({
      compoundResult:
        state.compoundResult ??
        buildNativeResult(
          state,
          buildMountedResultOptions(state),
        ),
    }))
    .addEdge(START, COMPOUND_GRAPH_NODES.PREPARE)
    .addEdge(COMPOUND_GRAPH_NODES.PREPARE, COMPOUND_GRAPH_NODES.SELECT_READY)
    .addConditionalEdges(
      COMPOUND_GRAPH_NODES.SELECT_READY,
      (state) => {
        if (state.currentLayer.length === 0) {
          return COMPOUND_GRAPH_NODES.EVALUATE;
        }

        if (state.readQueue.length > 0) {
          return state.readQueue.map(
            (prepared) =>
              new Send(COMPOUND_GRAPH_NODES.EXECUTE_READ_TASK, {
                ...state,
                preparedTasks: [prepared],
              }),
          );
        }

        return COMPOUND_GRAPH_NODES.EXECUTE_WRITE_TASK;
      },
      [
        COMPOUND_GRAPH_NODES.EVALUATE,
        COMPOUND_GRAPH_NODES.EXECUTE_READ_TASK,
        COMPOUND_GRAPH_NODES.EXECUTE_WRITE_TASK,
      ],
    )
    .addEdge(
      COMPOUND_GRAPH_NODES.EXECUTE_READ_TASK,
      COMPOUND_GRAPH_NODES.COLLECT,
    )
    .addEdge(
      COMPOUND_GRAPH_NODES.EXECUTE_WRITE_TASK,
      COMPOUND_GRAPH_NODES.COLLECT,
    )
    .addConditionalEdges(
      COMPOUND_GRAPH_NODES.COLLECT,
      (state) => {
        const currentIds = new Set(
          state.currentLayer.map((task) => task.id),
        );
        const currentOutcomes = state.outcomes.filter((outcome) =>
          currentIds.has(outcome.taskId),
        );

        if (hasConfirmationBoundary(currentOutcomes)) {
          return COMPOUND_GRAPH_NODES.EVALUATE;
        }

        return state.writeQueue.length > 0
          ? COMPOUND_GRAPH_NODES.EXECUTE_WRITE_TASK
          : COMPOUND_GRAPH_NODES.ADVANCE_LAYER;
      },
      [
        COMPOUND_GRAPH_NODES.ADVANCE_LAYER,
        COMPOUND_GRAPH_NODES.EVALUATE,
        COMPOUND_GRAPH_NODES.EXECUTE_WRITE_TASK,
      ],
    )
    .addConditionalEdges(
      COMPOUND_GRAPH_NODES.ADVANCE_LAYER,
      (state) =>
        state.layerIndex >= state.layers.length
          ? COMPOUND_GRAPH_NODES.EVALUATE
          : COMPOUND_GRAPH_NODES.SELECT_READY,
      [COMPOUND_GRAPH_NODES.EVALUATE, COMPOUND_GRAPH_NODES.SELECT_READY],
    )
    .addConditionalEdges(
      COMPOUND_GRAPH_NODES.EVALUATE,
      (state) => {
        if (state.route === "replan") {
          return COMPOUND_GRAPH_NODES.PREPARE;
        }

        if (!options.mounted) {
          return END;
        }

        const result =
          state.compoundResult ??
          buildNativeResult(
            state,
            buildMountedResultOptions(state),
          );

        return result.pendingAction
          ? COMPOUND_GRAPH_NODES.AWAIT_COMPOUND_USER
          : COMPOUND_GRAPH_NODES.PUBLISH_RESULT;
      },
      [
        COMPOUND_GRAPH_NODES.AWAIT_COMPOUND_USER,
        COMPOUND_GRAPH_NODES.PREPARE,
        COMPOUND_GRAPH_NODES.PUBLISH_RESULT,
        END,
      ],
    )
    .addConditionalEdges(
      COMPOUND_GRAPH_NODES.AWAIT_COMPOUND_USER,
      (state) => state.resumeRoute,
      [
        COMPOUND_GRAPH_NODES.ADVANCE_LAYER,
        COMPOUND_GRAPH_NODES.EXECUTE_WRITE_TASK,
        COMPOUND_GRAPH_NODES.PREPARE,
        COMPOUND_GRAPH_NODES.PUBLISH_RESULT,
        COMPOUND_GRAPH_NODES.SELECT_READY,
      ],
    )
    .addEdge(COMPOUND_GRAPH_NODES.PUBLISH_RESULT, END)
    .compile(
      options.checkpointer
        ? { checkpointer: options.checkpointer }
        : undefined,
    );

export const compileOrchestrationSubgraph = (
  dependencies: NativeOrchestrationSubgraphDependencies,
  options: {
    checkpointer?: BaseCheckpointSaver;
    disabledLoopDirectiveModes?: AgentExecutionStrategy["mode"][];
    maxTasksPerRun?: number;
    recordStrategyFeedbackMemory?: (
      input: StrategyFeedbackMemoryInput,
    ) => Promise<unknown>;
    resultOptions?: ExecuteOrchestrationGraphOptions;
  } = {},
) =>
  compileNativeOrchestrationGraph(dependencies, options);

export const compileMountedOrchestrationSubgraph = (
  dependencies: NativeOrchestrationSubgraphDependencies,
  options: {
    disabledLoopDirectiveModes?: AgentExecutionStrategy["mode"][];
    maxTasksPerRun?: number;
    recordStrategyFeedbackMemory?: (
      input: StrategyFeedbackMemoryInput,
    ) => Promise<unknown>;
  } = {},
) =>
  compileNativeOrchestrationGraph(dependencies, {
    ...options,
    mounted: true,
  });

const serializeTasksForPendingAction = (tasks: TaskNode[]) =>
  tasks.map((task) => ({
    agentRole: task.agentRole,
    args: task.args,
    dependsOn: task.dependsOn,
    id: task.id,
    intent: task.intent,
    label: task.label,
  }));

const buildNativeQueueResume = ({
  message,
  orchestrationId,
  plan,
  queueState,
  tasks,
}: {
  message: string;
  orchestrationId: string;
  plan: OrchestratorPlan;
  queueState: ReturnType<typeof summarizeExecutionQueue>;
  tasks: TaskNode[];
}): AgentQueueResumePendingAction | null => {
  const deferredTaskIds = Array.from(
    new Set([
      ...queueState.deferredTaskIds,
      ...queueState.pendingTaskIds,
    ]),
  );

  if (deferredTaskIds.length === 0) {
    return null;
  }

  return {
    completedTaskIds: Array.from(
      new Set([
        ...queueState.completedTaskIds,
        ...queueState.proposedTaskIds,
      ]),
    ),
    deferredTaskIds,
    mode: plan.mode,
    orchestrationId,
    originalMessage: message,
    reasoning: plan.reasoning,
    tasks: serializeTasksForPendingAction(tasks),
    type: "await_queue_resume",
  };
};

const buildNativeResult = (
  state: NativeOrchestrationSubgraphState,
  options: ExecuteOrchestrationGraphOptions,
): ExecutionGraphResult => {
  const baseObservations = state.outcomes.map(
    (outcome) => outcome.observation,
  );
  const proposals = state.outcomes.flatMap((outcome) =>
    outcome.proposal ? [outcome.proposal] : [],
  );
  const taskCatalog =
    state.taskCatalog.length > 0
      ? state.taskCatalog
      : state.plan.tasks;
  const initialQueueState = summarizeExecutionQueue(
    taskCatalog,
    baseObservations,
  );
  const deferredObservations = initialQueueState.pendingTaskIds.flatMap(
    (taskId) => {
      const task = taskCatalog.find((candidate) => candidate.id === taskId);

      return task
        ? [
            buildTaskObservation(task, {
              message: "前置步骤尚未完成，当前子任务已延后。",
              status: "deferred",
            }),
          ]
        : [];
    },
  );
  const observations = [
    ...baseObservations,
    ...deferredObservations,
  ];
  const queueState = summarizeExecutionQueue(taskCatalog, observations);
  const orchestrationId =
    options.orchestrationId ?? `orch-${Date.now()}`;
  const resumeQueue = buildNativeQueueResume({
    message: options.message ?? "",
    orchestrationId,
    plan: state.plan,
    queueState,
    tasks: taskCatalog,
  });
  const explicitPending =
    state.outcomes.find(
      (outcome) => outcome.pendingAction !== undefined,
    )?.pendingAction ?? null;
  let pendingAction: PendingAction | null = explicitPending;

  if (!pendingAction && proposals.length === 1) {
    pendingAction = {
      action: proposals[0],
      orchestrationId,
      ...(resumeQueue ? { resumeQueue } : {}),
      type: "await_confirmation",
    };
  } else if (!pendingAction && proposals.length > 1) {
    pendingAction = {
      actions: proposals,
      orchestrationId,
      ...(resumeQueue ? { resumeQueue } : {}),
      type: "await_batch_confirmation",
    };
  } else if (!pendingAction && resumeQueue) {
    pendingAction = resumeQueue;
  }

  const executedCount = observations.filter((observation) =>
    ["answered", "auto_executed", "executed"].includes(
      observation.status,
    ),
  ).length;
  const readMessages = state.outcomes
    .filter(
      (outcome) =>
        outcome.observation.status !== "proposed",
    )
    .map((outcome) => outcome.assistantMessage)
    .filter(Boolean);
  const proposalLines = proposals.map(
    (proposal, index) =>
      `${index + 1}. ${proposal.summary}（${proposal.riskLevel}）`,
  );
  const assistantMessage = [
    state.plan.reasoning
      ? `编排说明：${state.plan.reasoning}`
      : null,
    readMessages.length > 0 ? readMessages.join("\n") : null,
    proposals.length === 1
      ? `待确认：${proposals[0].summary}`
      : proposals.length > 1
        ? [`共 ${proposals.length} 项操作待确认：`, ...proposalLines].join(
            "\n",
          )
        : null,
    resumeQueue
      ? `还有 ${resumeQueue.deferredTaskIds.length} 个子任务已延后；处理当前步骤后可回复「继续」恢复执行。`
      : null,
    state.compensationMessages.length > 0
      ? state.compensationMessages.join("\n")
      : null,
    state.compensationIndeterminate
      ? "部分补偿状态不确定，已停止自动处理，请人工检查相关业务记录。"
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  const evaluation = buildExecutionEvaluation({
    canReplan: false,
    context: options.promptContext,
    observations,
    pendingAction,
    proposals,
    queueState,
  });

  return {
    assistantMessage:
      assistantMessage || "子任务已处理，无需写入确认。",
    evaluation,
    executedCount,
    observations,
    pendingAction,
    proposals,
    queueState,
  };
};

export const runOrchestrationSubgraph = async (
  plan: OrchestratorPlan,
  dryRunContext: AgentToolDryRunContext,
  options: ExecuteOrchestrationGraphOptions & {
    dependencies?: NativeOrchestrationSubgraphDependencies;
    onNode?: (node: OrchestrationSubgraphNode) => void;
  } = {},
): Promise<ExecutionGraphResult> => {
  const {
    checkpointer,
    dependencies,
    onNode = () => undefined,
    runnableConfig,
    ...executionOptions
  } = options;
  const nodeOrder: OrchestrationSubgraphNode[] = [
    "prepare",
    "select_ready",
    "execute_layer",
    "collect",
    "evaluate",
  ];

  for (const node of nodeOrder) {
    onNode(node);
  }

  const nativeDependencies =
    dependencies ??
    createNativeOrchestrationTaskExecutor({
        autoApproval: executionOptions.autoApproval,
        dryRunContext,
        executeAction: executionOptions.executeAction,
        executeIntent: executionOptions.executeIntent,
        message: executionOptions.message,
        modelCallRecorder: executionOptions.modelCallRecorder,
        plan,
        promptContext: executionOptions.promptContext,
        recordAutoApproval: executionOptions.recordAutoApproval,
      });
  const replanTaskFailure =
    executionOptions.replanTaskFailure ??
    replanAfterTaskFailure;
  const graph = compileOrchestrationSubgraph({
    ...nativeDependencies,
    repair:
      nativeDependencies.repair ??
      (!executionOptions.disableToolFailureRepair
        ? async ({ failedObservation, state }) => {
            const failedTask =
              state.taskCatalog.find(
                (task) => task.id === failedObservation.taskId,
              ) ??
              state.plan.tasks.find(
                (task) => task.id === failedObservation.taskId,
              );

            if (!failedTask) {
              return null;
            }

            return (
              buildToolFailureRepairPlan({
                failureCode: failedObservation.errorCode,
                failedTask,
                failureReason: getSafeExecutionFailure(
                  failedObservation.errorCode,
                ).safeReplanReason,
                message: executionOptions.message ?? "",
              })?.plan ?? null
            );
          }
        : undefined),
    compensate:
      nativeDependencies.compensate ??
      (executionOptions.executeRollback
        ? async ({ outcomes }) => {
            const messages: string[] = [];

            for (const outcome of [...outcomes].reverse()) {
              const actionId = outcome.observation.actionId;

              if (!actionId || outcome.rollbackPayload === undefined) {
                continue;
              }

              try {
                await executionOptions.executeRollback?.({
                  actionId,
                  intent: outcome.observation.intent,
                  rollbackPayload: outcome.rollbackPayload,
                });
                messages.push(
                  `↩ 已补偿「${outcome.observation.label}」。`,
                );
              } catch {
                const failure = projectSafeExecutionFailure("rollback");
                messages.push(
                  `⚠️「${outcome.observation.label}」：${failure.safeUserMessage}`,
                );

                return {
                  indeterminate: true,
                  messages,
                };
              }
            }

            return {
              indeterminate: false,
              messages,
            };
          }
        : undefined),
    replan:
      nativeDependencies.replan ??
      (executionOptions.promptContext &&
      executionOptions.message
        ? async ({ failedObservation, state }) => {
            const failedTask =
              state.taskCatalog.find(
                (task) => task.id === failedObservation.taskId,
              ) ??
              state.plan.tasks.find(
                (task) => task.id === failedObservation.taskId,
              );

            if (!failedTask) {
              return null;
            }

            const failedTaskIndex = state.plan.tasks.findIndex(
              (task) => task.id === failedTask.id,
            );

            const result = await replanTaskFailure({
              failedTask,
              failedTaskIndex:
                failedTaskIndex >= 0
                  ? failedTaskIndex
                  : state.plan.tasks.length - 1,
              failureReason: getSafeExecutionFailure(
                failedObservation.errorCode,
              ).safeReplanReason,
              failureType: "tool_error",
              message: executionOptions.message ?? "",
              modelCallRecorder: executionOptions.modelCallRecorder,
              observations: state.outcomes.map(
                (outcome) => outcome.observation,
              ),
              originalPlan: state.plan,
              proposals: state.outcomes.flatMap((outcome) =>
                outcome.proposal ? [outcome.proposal] : [],
              ),
              promptContext:
                executionOptions.promptContext as AgentPromptContext,
              queueState: summarizeExecutionQueue(
                state.plan.tasks,
                state.outcomes.map(
                  (outcome) => outcome.observation,
                ),
              ),
            });

            if (result.status === "success") {
              return result.plan;
            }

            const currentResult = buildNativeResult(
              state,
              executionOptions,
            );

            return {
              pausedResult: {
                ...currentResult,
                assistantMessage: result.safeMessage,
                evaluation: buildExecutionEvaluation({
                  canReplan: false,
                  context: executionOptions.promptContext,
                  observations: currentResult.observations,
                  pendingAction: null,
                  proposals: [],
                  queueState: currentResult.queueState,
                }),
                pendingAction: null,
                proposals: [],
              },
            };
          }
        : undefined),
  }, {
    checkpointer,
    disabledLoopDirectiveModes:
      executionOptions.disabledLoopDirectiveModes,
    maxTasksPerRun: executionOptions.maxTasksPerRun,
    recordStrategyFeedbackMemory:
      executionOptions.recordStrategyFeedbackMemory,
    resultOptions: executionOptions,
  });
  const state = await graph.invoke({ plan }, runnableConfig);

  return state.compoundResult ?? buildNativeResult(state, executionOptions);
};
