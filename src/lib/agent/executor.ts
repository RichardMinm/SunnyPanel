import { getPayloadClient } from "@/lib/payload/client";

import { evaluatePlanFromIntent } from "./evaluation";
import { runWithAgentExecutionContext } from "./execution-context";
import { hasServerInternalFailedAuditCompensation } from "./internal-rollback-evidence";
import { queryProgressFromIntent } from "./progress";
import {
  executeRollbackFromPayload,
  isRollbackPayloadExecutable,
  type RollbackExecutionResult,
} from "./rollback";
import {
  executeTrustedRollbackRequest,
  type RollbackPayloadStore,
  type TrustedRollbackRequestInput,
} from "./rollback-request";
import type { AgentIntent, AgentTraceStep } from "./schemas";
import { executeAgentTool } from "./tool-registry";
import { executeWeeklyReviewFromIntent } from "./workflows/weekly-review-server";
import {
  addCompletionNoteFromIntent,
  appendPlanItemFromIntent,
  cancelScheduleItemFromIntent,
  composePlanFromIntent,
  composeScheduleItemFromIntent,
  composeTimelineEventFromIntent,
  completePlanItemFromIntent,
  createChecklistFromIntent,
  createPlanFromIntent,
  deleteRecordFromIntent,
  modifyRecordFromIntent,
  queryPlanProgressFromIntent,
  rescheduleItemFromIntent,
  saveMemoryFromIntent,
  schedulePlanFromIntent,
} from "./tools";

type AgentExecutionTraceReporter = (step: AgentTraceStep) => void;

type AgentExecutionOptions = {
  userId?: number;
};

export type AgentIntentExecutor = (
  intent: AgentIntent,
  onTrace?: AgentExecutionTraceReporter,
  options?: AgentExecutionOptions,
) => Promise<AgentIntentExecutionResult>;

export type AgentRollbackExecutor = (
  rollbackPayload: unknown,
  options?: { userId?: number },
) => Promise<RollbackExecutionResult>;

export type TransactionalExecutionOptions = {
  executeIntent?: AgentIntentExecutor;
  executeRollback?: AgentRollbackExecutor;
  executeTrustedRollbackRequest?: (
    input: TrustedRollbackRequestInput,
  ) => ReturnType<typeof executeTrustedRollbackRequest>;
  isRollbackExecutable?: (rollbackPayload: unknown) => boolean;
  rollbackPayloadStore?: RollbackPayloadStore;
  userId?: number;
};

export type AgentIntentExecutionResult = {
  affectedDocuments?: import("./tool-shared").AffectedDocumentSummary[];
  assistantMessage: string;
  createdPlanId?: number;
  pendingAction: null | import("./schemas").PendingAction;
  planId?: number;
  rollbackPayload?: unknown;
  rollbackSourceRunId?: number;
  status?: "completed" | "failed";
};

const toolExecutors = {
  addCompletionNote: addCompletionNoteFromIntent,
  appendPlanItem: appendPlanItemFromIntent,
  cancelScheduleItem: cancelScheduleItemFromIntent,
  composePlan: composePlanFromIntent,
  composeScheduleItem: composeScheduleItemFromIntent,
  composeTimelineEvent: composeTimelineEventFromIntent,
  completePlanItem: completePlanItemFromIntent,
  createPlan: createPlanFromIntent,
  deleteRecord: deleteRecordFromIntent,
  modifyRecord: modifyRecordFromIntent,
  queryPlanProgress: queryPlanProgressFromIntent,
  rescheduleItem: rescheduleItemFromIntent,
  saveMemory: saveMemoryFromIntent,
  schedulePlan: schedulePlanFromIntent,
  weeklyReview: executeWeeklyReviewFromIntent,
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const formatRollbackResult = (result: RollbackExecutionResult) =>
  `${result.collection}#${result.documentIds?.join(",") ?? result.documentId} (${result.strategy})${result.auditWarning ? `，审计提示：${result.auditWarning}` : ""}`;

type BatchRollbackEvidence =
  | {
      kind: "owned_agent_run";
      rollbackPayload: unknown;
      rollbackSourceRunId: number;
    }
  | {
      kind: "server_internal_failed_audit";
      rollbackPayload: unknown;
    };

const isTrustedUserId = (value: unknown): value is number =>
  typeof value === "number"
  && Number.isSafeInteger(value)
  && value > 0;

const normalizeRollbackSourceRunId = (value: unknown) =>
  typeof value === "number"
  && Number.isSafeInteger(value)
  && value > 0
    ? value
    : undefined;

const executeBatchRollbackEvidence = async (
  evidence: BatchRollbackEvidence,
  options: TransactionalExecutionOptions,
): Promise<RollbackExecutionResult> => {
  if (evidence.kind === "server_internal_failed_audit") {
    const executeRollback = options.executeRollback ?? executeRollbackFromPayload;

    return executeRollback(evidence.rollbackPayload, {
      userId: options.userId,
    });
  }

  if (!isTrustedUserId(options.userId)) {
    throw new Error("自动补偿缺少已认证的用户上下文。");
  }

  const payload = options.rollbackPayloadStore ?? await getPayloadClient();
  const trustedRollbackRequest =
    options.executeTrustedRollbackRequest ?? executeTrustedRollbackRequest;
  const trustedResult = await trustedRollbackRequest({
    ...(options.executeRollback
      ? {
          executeRollback: (rollbackPayload) =>
            options.executeRollback!(rollbackPayload, {
              userId: options.userId,
            }),
        }
      : {}),
    payload: payload as RollbackPayloadStore,
    sourceRunId: evidence.rollbackSourceRunId,
    userId: options.userId,
  });

  return trustedResult.result;
};

export const executeAgentIntentsTransactional = async (
  intents: AgentIntent[],
  onTrace?: AgentExecutionTraceReporter,
  options: TransactionalExecutionOptions = {},
): Promise<AgentIntentExecutionResult> => {
  if (intents.length <= 1) {
    const single = intents[0];

    return single
      ? (options.executeIntent ?? executeAgentIntent)(single, onTrace, { userId: options.userId })
      : { assistantMessage: "", pendingAction: null };
  }

  const executeIntent = options.executeIntent ?? executeAgentIntent;
  const isExecutable = options.isRollbackExecutable ?? isRollbackPayloadExecutable;
  const messages: string[] = [];
  const affectedDocuments: NonNullable<AgentIntentExecutionResult["affectedDocuments"]> = [];
  const rollbackEvidence: BatchRollbackEvidence[] = [];
  let pendingAction: AgentIntentExecutionResult["pendingAction"] = null;
  let rollbackPayload: unknown;
  let rollbackSourceRunId: number | undefined;

  const failBatch = async (input: {
    compensationEvidence: BatchRollbackEvidence[];
    failureMessage: string;
    failureType: "invariant" | "returned" | "thrown";
    stepNumber: number;
  }): Promise<AgentIntentExecutionResult> => {
    const rollbackResults: RollbackExecutionResult[] = [];
    let rollbackFailures = 0;

    onTrace?.({
      detail:
        input.failureType === "returned"
          ? "子操作返回失败回执，批量执行已停止。"
          : input.failureType === "invariant"
            ? "成功子操作缺少受信 AgentRun 回滚来源，批量执行已失败关闭。"
          : input.failureMessage,
      id: `batch-transaction-step-${input.stepNumber}`,
      kind: "error",
      status: "error",
      title: `批量执行在第 ${input.stepNumber} 项失败`,
    });

    for (const [rollbackIndex, evidence] of input.compensationEvidence.entries()) {
      const rollbackStep = rollbackIndex + 1;

      onTrace?.({
        detail: `正在补偿已确认副作用 ${rollbackStep}/${input.compensationEvidence.length}。`,
        id: `batch-transaction-rollback-${rollbackStep}`,
        kind: "action",
        status: "running",
        title: "自动补偿回滚",
      });

      try {
        const rollbackResult = await executeBatchRollbackEvidence(evidence, options);
        rollbackResults.push(rollbackResult);
        onTrace?.({
          detail: formatRollbackResult(rollbackResult),
          id: `batch-transaction-rollback-${rollbackStep}`,
          kind: "complete",
          status: "done",
          title: "自动补偿回滚完成",
        });
      } catch {
        rollbackFailures += 1;
        onTrace?.({
          detail: "该项自动补偿未完成，结果可能不确定，需要人工核查。",
          id: `batch-transaction-rollback-${rollbackStep}`,
          kind: "error",
          status: "error",
          title: "自动补偿回滚未完成",
        });
      }
    }

    const rollbackSummary =
      input.compensationEvidence.length === 0
        ? "没有检测到可自动补偿的已执行动作。"
        : rollbackFailures === 0
          ? `已自动回滚 ${rollbackResults.length} 项，已完整补偿：${rollbackResults.map(formatRollbackResult).join("；")}。`
          : `补偿未完整：已确认补偿 ${rollbackResults.length}/${input.compensationEvidence.length} 项，另有 ${rollbackFailures} 项失败或结果不确定，需要人工核查。`;

    return {
      assistantMessage: [
        ...messages,
        input.failureType === "returned"
          ? `❌ 批量执行在第 ${input.stepNumber}/${intents.length} 步失败：${input.failureMessage}`
          : input.failureType === "invariant"
            ? `❌ 批量执行在第 ${input.stepNumber}/${intents.length} 步触发安全不变量：${input.failureMessage}`
            : `❌ 批量执行在第 ${input.stepNumber}/${intents.length} 步失败（抛出异常）：${input.failureMessage}`,
        rollbackSummary,
      ]
        .filter(Boolean)
        .join("\n\n"),
      pendingAction: null,
      status: "failed",
    };
  };

  for (const [index, intent] of intents.entries()) {
    const stepNumber = index + 1;

    onTrace?.({
      detail: `正在执行第 ${stepNumber}/${intents.length} 项批量操作。`,
      id: `batch-transaction-step-${stepNumber}`,
      kind: "action",
      status: "running",
      title: `事务批量执行 ${stepNumber}/${intents.length}`,
    });

    try {
      const result = await executeIntent(
        intent,
        (step) =>
          onTrace?.({
            ...step,
            id: `${step.id}-transaction-${index}`,
          }),
        { userId: options.userId },
      );

      const hasExecutableRollback =
        Boolean(result.rollbackPayload)
        && isExecutable(result.rollbackPayload);
      const sourceRunId = normalizeRollbackSourceRunId(
        result.rollbackSourceRunId,
      );
      const ownedRollbackEvidence =
        hasExecutableRollback && sourceRunId
          ? {
              kind: "owned_agent_run" as const,
              rollbackPayload: result.rollbackPayload,
              rollbackSourceRunId: sourceRunId,
            }
          : null;
      const failedAuditRollbackEvidence =
        result.status === "failed"
        && hasExecutableRollback
        && !sourceRunId
        && hasServerInternalFailedAuditCompensation(result)
          ? {
              kind: "server_internal_failed_audit" as const,
              rollbackPayload: result.rollbackPayload,
            }
          : null;

      if (result.status === "failed") {
        return failBatch({
          compensationEvidence: [
            ...(ownedRollbackEvidence
              ? [ownedRollbackEvidence]
              : failedAuditRollbackEvidence
                ? [failedAuditRollbackEvidence]
                : []),
            ...rollbackEvidence.slice().reverse(),
          ],
          failureMessage: result.assistantMessage || "子操作返回失败回执。",
          failureType: "returned",
          stepNumber,
        });
      }

      if (hasExecutableRollback && !ownedRollbackEvidence) {
        return failBatch({
          compensationEvidence: rollbackEvidence.slice().reverse(),
          failureMessage:
            "成功子操作返回了可执行回滚载荷，但没有正安全整数 rollbackSourceRunId；当前子操作未做裸补偿，结果需要人工核查。",
          failureType: "invariant",
          stepNumber,
        });
      }

      if (result.assistantMessage) {
        messages.push(result.assistantMessage);
      }
      affectedDocuments.push(...(result.affectedDocuments ?? []));

      if (result.pendingAction) {
        pendingAction = result.pendingAction;
      }

      if (result.rollbackPayload) {
        rollbackPayload = result.rollbackPayload;

        if (ownedRollbackEvidence) {
          rollbackEvidence.push(ownedRollbackEvidence);
          rollbackSourceRunId = ownedRollbackEvidence.rollbackSourceRunId;
        }
      }

      onTrace?.({
        detail:
          result.rollbackPayload && isExecutable(result.rollbackPayload)
            ? "已记录可自动补偿的 rollbackPayload。"
            : undefined,
        id: `batch-transaction-step-${stepNumber}`,
        kind: "complete",
        status: "done",
        title: `事务批量执行完成 ${stepNumber}/${intents.length}`,
      });
    } catch (error) {
      return failBatch({
        compensationEvidence: rollbackEvidence.slice().reverse(),
        failureMessage: getErrorMessage(error),
        failureType: "thrown",
        stepNumber,
      });
    }
  }

  return {
    ...(affectedDocuments.length > 0 ? { affectedDocuments } : {}),
    assistantMessage: messages.filter(Boolean).join("\n\n"),
    pendingAction,
    rollbackPayload,
    ...(rollbackSourceRunId ? { rollbackSourceRunId } : {}),
    status: "completed",
  };
};

export const executeAgentIntent = async (
  intent: AgentIntent,
  onTrace?: AgentExecutionTraceReporter,
  options: AgentExecutionOptions = {},
): Promise<AgentIntentExecutionResult> => {
  switch (intent.intent) {
    case "capability_query":
    case "query_memory":
    case "answer_question":
    case "explain_concept":
    case "expand_answer":
    case "give_examples":
    case "compare_concepts":
    case "give_learning_path":
    case "summarize_answer":
    case "rewrite_answer":
      onTrace?.({
        detail: intent.args.suggestAction ?? "这轮只生成回答，不写入计划、清单或审计数据。",
        id: "workflow-answer-question",
        kind: "analysis",
        status: "done",
        title: "已切换到直接回答流程",
      });

      const resolvedMessage = (intent.reply ?? intent.args.answer)?.trim();
      const openTopic =
        intent.intent === "answer_question" ? intent.args.openDomainTopic : undefined;

      return {
        assistantMessage:
          resolvedMessage ||
          (openTopic
            ? `关于「${openTopic}」：我暂时无法连接回答模型，请检查 Agent 设置中的 API Key 与模型配置后重试。`
            : "我暂时无法生成回答，请检查 Agent 设置中的 API Key 与模型配置后重试。"),
        pendingAction: intent.args.learningContext
          ? {
              originalMessage: intent.args.learningContext.originalMessage,
              profile: "profile" in intent.args.learningContext ? intent.args.learningContext.profile : undefined,
              requestedAction: "requestedAction" in intent.args.learningContext ? intent.args.learningContext.requestedAction : undefined,
              subject: intent.args.learningContext.subject,
              type: "await_learning_followup",
            }
          : null,
      };
    case "create_plan":
    case "append_plan_item":
    case "complete_plan_item":
    case "compose_plan":
    case "cancel_schedule_item":
    case "compose_schedule_item":
    case "create_schedule_items":
    case "compose_timeline_event":
    case "add_completion_note":
    case "query_plan_progress":
    case "reschedule_item":
    case "save_memory":
    case "schedule_plan":
    case "weekly_review":
    case "delete_record":
    case "modify_record":
      const result = await runWithAgentExecutionContext({ userId: options.userId }, () =>
        executeAgentTool(intent, toolExecutors, onTrace),
      );
      return (
        result ?? {
          assistantMessage: "工具执行失败",
          pendingAction: null,
          status: "failed",
        }
      );
    case "compose_checklist":
      onTrace?.({
        detail: "清单草案预览，不写入 checklist 数据。",
        id: "workflow-compose-checklist",
        kind: "analysis",
        status: "done",
        title: "清单草案预览",
      });
      return {
        assistantMessage: "清单草案预览已生成（仅草案，未写入数据库）。",
        pendingAction: null,
        status: "completed",
      };
    case "query_checklist_progress":
    case "query_schedule":
      onTrace?.({
        detail: "只读日程查询，不写入 schedule-items。",
        id: "workflow-query-schedule",
        kind: "analysis",
        status: "done",
        title: "只读日程查询",
      });
      // query_schedule is read-only — return a simple receipt, no DB write
      return {
        assistantMessage: "日程查询完成（只读，未写入数据库）。",
        pendingAction: null,
        status: "completed",
      };
    case "query_plan":
    case "query_timeline":
    case "query_progress":
      onTrace?.({
        detail: intent.args.checklistTitle ? `目标清单：${intent.args.checklistTitle}` : "范围：整体进度",
        id: "workflow-query-progress",
        kind: "analysis",
        status: "done",
        title: "已切换到进度查询流程",
      });
      return queryProgressFromIntent(intent.args);
    case "evaluate_plan":
      onTrace?.({
        detail: intent.args.planTitle ? `目标计划：${intent.args.planTitle}` : "范围：全部计划",
        id: "workflow-evaluate-plan",
        kind: "analysis",
        status: "done",
        title: "已切换到计划评估流程",
      });
      return runWithAgentExecutionContext({ userId: options.userId }, () =>
        evaluatePlanFromIntent(intent.args),
      );
    case "create_checklist":
      return createChecklistFromIntent(intent.args, onTrace, { userId: options.userId });
    case "clarify":
    default:
      return {
        assistantMessage: intent.reply ?? intent.args.question,
        pendingAction: null,
      };
  }
};
