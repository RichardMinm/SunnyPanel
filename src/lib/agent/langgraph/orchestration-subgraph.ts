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
import {
  summarizeExecutionQueue,
} from "@/lib/agent/orchestration/observations";
import {
  buildResumedOrchestratorPlan,
  buildStrategyResumeOrchestratorPlan,
} from "@/lib/agent/execution-graph";
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
} from "@/lib/agent/orchestration/replan";
import { buildToolFailureRepairPlan } from "@/lib/agent/orchestration/tool-failure-repair";
import type { SunnyAgentGraphInput } from "@/lib/agent/langgraph/state";
import type { StructuredConfirmation } from "@/lib/agent/chat-pipeline/confirmation-step";
import {
  confirmationMatchesBatchPending,
  confirmationMatchesPending,
} from "@/lib/agent/chat-pipeline/confirmation-step";
import type { AgentChatResponse, AgentTraceStep } from "@/lib/agent/schemas";

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
  orchestrationId?: string;
  promptContext?: AgentPromptContext;
  runnableConfig?: RunnableConfig;
  replanAttempts?: number;
  replanTaskFailure?: (input: ReplanInput) => Promise<OrchestratorPlan>;
  toolRepairAttempts?: number;
};

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
  }) => Promise<OrchestratorPlan | null>;
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
    default: () => "publish_result",
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
    maxTasksPerRun?: number;
    mounted?: boolean;
  } = {},
) =>
  new StateGraph(NativeStateAnnotation)
    .addNode("prepare", (state) => {
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
    .addNode("select_ready", async (state) => {
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
    .addNode("execute_read_task", async (state) => {
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
    .addNode("execute_write_task", async (state) => {
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
    .addNode("collect", (state) => {
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
    .addNode("advance_layer", (state) => {
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
    .addNode("evaluate", async (state) => {
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
            outcomes: outcomes.map((outcome) =>
              outcome.taskId === failedObservation.taskId
                ? {
                    ...outcome,
                    observation: {
                      ...outcome.observation,
                      message: `${outcome.observation.message} 已转入语义修复。`,
                      repairedByTaskId: repairTaskId,
                    },
                  }
                : outcome,
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

        if (replanned && replanned.tasks.length > 0) {
          const existingTaskIds = new Set(
            state.taskCatalog.map((task) => task.id),
          );
          const repairTaskId = replanned.tasks[0].id;
          const repairedOutcomes = outcomes.map((outcome) =>
            outcome.taskId === failedObservation.taskId
              ? {
                  ...outcome,
                  observation: {
                    ...outcome.observation,
                    message: `${outcome.observation.message} 已转入重规划。`,
                    repairedByTaskId: repairTaskId,
                  },
                }
              : outcome,
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
    .addNode("await_compound_user", async (state) => {
      const result = buildNativeResult(
        state,
        buildMountedResultOptions(state),
      );
      const pendingAction = result.pendingAction;

      if (!pendingAction) {
        return {
          compoundResult: result,
          resumeRoute: "publish_result" as const,
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
          resumeRoute: "publish_result" as const,
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
              ? "execute_write_task" as const
              : "advance_layer" as const,
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
              ? "select_ready" as const
              : resumedPlan.tasks.length > 0
                ? "prepare" as const
                : "publish_result" as const,
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
              ? "prepare" as const
              : "publish_result" as const,
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
        resumeRoute: "publish_result" as const,
      };
    })
    .addNode("publish_result", (state) => ({
      compoundResult:
        state.compoundResult ??
        buildNativeResult(
          state,
          buildMountedResultOptions(state),
        ),
    }))
    .addEdge(START, "prepare")
    .addEdge("prepare", "select_ready")
    .addConditionalEdges(
      "select_ready",
      (state) => {
        if (state.currentLayer.length === 0) {
          return "evaluate";
        }

        if (state.readQueue.length > 0) {
          return state.readQueue.map(
            (prepared) =>
              new Send("execute_read_task", {
                ...state,
                preparedTasks: [prepared],
              }),
          );
        }

        return "execute_write_task";
      },
      ["evaluate", "execute_read_task", "execute_write_task"],
    )
    .addEdge("execute_read_task", "collect")
    .addEdge("execute_write_task", "collect")
    .addConditionalEdges(
      "collect",
      (state) => {
        const currentIds = new Set(
          state.currentLayer.map((task) => task.id),
        );
        const currentOutcomes = state.outcomes.filter((outcome) =>
          currentIds.has(outcome.taskId),
        );

        if (hasConfirmationBoundary(currentOutcomes)) {
          return "evaluate";
        }

        return state.writeQueue.length > 0
          ? "execute_write_task"
          : "advance_layer";
      },
      ["advance_layer", "evaluate", "execute_write_task"],
    )
    .addConditionalEdges(
      "advance_layer",
      (state) =>
        state.layerIndex >= state.layers.length
          ? "evaluate"
          : "select_ready",
      ["evaluate", "select_ready"],
    )
    .addConditionalEdges(
      "evaluate",
      (state) => {
        if (state.route === "replan") {
          return "prepare";
        }

        if (!options.mounted) {
          return END;
        }

        return buildNativeResult(
          state,
          buildMountedResultOptions(state),
        ).pendingAction
          ? "await_compound_user"
          : "publish_result";
      },
      ["await_compound_user", "prepare", "publish_result", END],
    )
    .addConditionalEdges(
      "await_compound_user",
      (state) => state.resumeRoute,
      [
        "advance_layer",
        "execute_write_task",
        "prepare",
        "publish_result",
        "select_ready",
      ],
    )
    .addEdge("publish_result", END)
    .compile(
      options.checkpointer
        ? { checkpointer: options.checkpointer }
        : undefined,
    );

export const compileOrchestrationSubgraph = (
  dependencies: NativeOrchestrationSubgraphDependencies,
  options: {
    checkpointer?: BaseCheckpointSaver;
    maxTasksPerRun?: number;
  } = {},
) =>
  compileNativeOrchestrationGraph(dependencies, options);

export const compileMountedOrchestrationSubgraph = (
  dependencies: NativeOrchestrationSubgraphDependencies,
  options: {
    maxTasksPerRun?: number;
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
}: {
  message: string;
  orchestrationId: string;
  plan: OrchestratorPlan;
  queueState: ReturnType<typeof summarizeExecutionQueue>;
}): AgentQueueResumePendingAction | null => {
  if (queueState.pendingTaskIds.length === 0) {
    return null;
  }

  return {
    completedTaskIds: queueState.completedTaskIds,
    deferredTaskIds: queueState.pendingTaskIds,
    mode: plan.mode,
    orchestrationId,
    originalMessage: message,
    reasoning: plan.reasoning,
    tasks: serializeTasksForPendingAction(plan.tasks),
    type: "await_queue_resume",
  };
};

const buildNativeResult = (
  state: NativeOrchestrationSubgraphState,
  options: ExecuteOrchestrationGraphOptions,
): ExecutionGraphResult => {
  const observations = state.outcomes.map(
    (outcome) => outcome.observation,
  );
  const proposals = state.outcomes.flatMap((outcome) =>
    outcome.proposal ? [outcome.proposal] : [],
  );
  const queueState = summarizeExecutionQueue(
    state.taskCatalog.length > 0
      ? state.taskCatalog
      : state.plan.tasks,
    observations,
  );
  const orchestrationId =
    options.orchestrationId ?? `orch-${Date.now()}`;
  const resumeQueue = buildNativeQueueResume({
    message: options.message ?? "",
    orchestrationId,
    plan: state.plan,
    queueState,
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
        plan,
        promptContext: executionOptions.promptContext,
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
                failedTask,
                failureReason:
                  failedObservation.error ??
                  failedObservation.message,
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
              } catch (error) {
                messages.push(
                  `⚠️「${outcome.observation.label}」补偿状态不确定：${
                    error instanceof Error
                      ? error.message
                      : String(error)
                  }`,
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

            return replanTaskFailure({
              failedTask,
              failedTaskIndex:
                failedTaskIndex >= 0
                  ? failedTaskIndex
                  : state.plan.tasks.length - 1,
              failureReason:
                failedObservation.error ??
                failedObservation.message,
              failureType: "tool_error",
              message: executionOptions.message ?? "",
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
          }
        : undefined),
  }, {
    checkpointer,
    maxTasksPerRun: executionOptions.maxTasksPerRun,
  });
  const state = await graph.invoke({ plan }, runnableConfig);

  return buildNativeResult(state, executionOptions);
};
