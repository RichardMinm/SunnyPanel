export type SafeExecutionFailureCode =
  | "checklist_item_not_found"
  | "projection_failed"
  | "rollback_indeterminate"
  | "runtime_failed"
  | "task_execute_failed"
  | "task_prepare_failed";

export type SafeExecutionFailurePhase =
  | "execute"
  | "prepare"
  | "projection"
  | "rollback"
  | "runtime";

export type SafeExecutionFailure = Readonly<{
  code: SafeExecutionFailureCode;
  safeObservationMessage: string;
  safeReplanReason: string;
  safeUserMessage: string;
}>;

export type SafeExecutionTraceError = Readonly<{
  code: SafeExecutionFailureCode;
  message: string;
  name: "SafeExecutionFailure";
}>;

export class SafeExecutionError extends Error {
  readonly code: SafeExecutionFailureCode;

  constructor(code: SafeExecutionFailureCode) {
    const failure = getSafeExecutionFailure(code);
    super(failure.safeReplanReason);
    this.code = failure.code;
    this.name = "SafeExecutionError";
  }
}

const FAILURES: Record<SafeExecutionFailurePhase, SafeExecutionFailure> = {
  execute: {
    code: "task_execute_failed",
    safeObservationMessage: "任务执行未完成，已保留当前状态。",
    safeReplanReason: "task_execute_failed: 子任务执行未完成，已保留当前状态。",
    safeUserMessage: "这项任务未能完成，当前状态已保留，请稍后重试。",
  },
  prepare: {
    code: "task_prepare_failed",
    safeObservationMessage: "任务准备未完成，未执行后续操作。",
    safeReplanReason: "task_prepare_failed: 子任务准备未完成，未执行后续操作。",
    safeUserMessage: "这项任务暂时无法准备完成，尚未执行任何操作。",
  },
  projection: {
    code: "projection_failed",
    safeObservationMessage: "业务结果整理未完成，原执行结果已保留。",
    safeReplanReason: "projection_failed: 业务结果整理未完成，原执行结果已保留。",
    safeUserMessage: "结果已保留，但关联信息暂未整理完成，请稍后刷新查看。",
  },
  rollback: {
    code: "rollback_indeterminate",
    safeObservationMessage: "恢复操作未能确认完成，当前状态可能不确定。",
    safeReplanReason: "rollback_indeterminate: 恢复操作状态不确定，需要人工核查。",
    safeUserMessage: "恢复操作的状态暂时无法确认，请人工核查当前数据后再继续。",
  },
  runtime: {
    code: "runtime_failed",
    safeObservationMessage: "Agent 运行未完成，会话状态已保留。",
    safeReplanReason: "runtime_failed: Agent 运行未完成，会话状态已保留。",
    safeUserMessage: "处理请求时遇到问题，你的会话状态已保留，请稍后重试。",
  },
};

const CHECKLIST_ITEM_NOT_FOUND: SafeExecutionFailure = {
  code: "checklist_item_not_found",
  safeObservationMessage: "找不到清单项，未执行后续操作。",
  safeReplanReason: "checklist_item_not_found: 找不到清单项。",
  safeUserMessage: "没有找到要操作的清单项，请核对名称或先创建该条目。",
};

const allSafeFailures = (): SafeExecutionFailure[] => [
  ...Object.values(FAILURES),
  CHECKLIST_ITEM_NOT_FOUND,
];

/**
 * Projects a failure phase to text that is safe for users, persisted
 * observations, and Provider-visible replanning. Raw exceptions are
 * intentionally not accepted by this boundary.
 */
export const projectSafeExecutionFailure = (
  phase: SafeExecutionFailurePhase,
): SafeExecutionFailure => FAILURES[phase];

/** A client/persistence-safe trace projection. Never accepts a raw exception. */
export const buildSafeExecutionTraceError = (
  phase: SafeExecutionFailurePhase,
): SafeExecutionTraceError => {
  const failure = projectSafeExecutionFailure(phase);

  return {
    code: failure.code,
    message: failure.safeObservationMessage,
    name: "SafeExecutionFailure",
  };
};

export const getSafeExecutionFailure = (
  code: SafeExecutionFailureCode | undefined,
): SafeExecutionFailure => {
  if (code === CHECKLIST_ITEM_NOT_FOUND.code) {
    return CHECKLIST_ITEM_NOT_FOUND;
  }

  const match = allSafeFailures().find((failure) => failure.code === code);
  return match ?? FAILURES.execute;
};

export const coerceSafeReplanReason = (value: unknown): string => {
  const match = typeof value === "string"
    ? allSafeFailures().find((failure) => failure.safeReplanReason === value)
    : undefined;
  return (match ?? FAILURES.execute).safeReplanReason;
};

/** Reads a raw exception only to select a typed projection; raw text is never returned. */
export const classifySafeExecutionFailure = (
  error: unknown,
  phase: SafeExecutionFailurePhase,
): SafeExecutionFailure => {
  if (error instanceof SafeExecutionError) {
    return getSafeExecutionFailure(error.code);
  }

  return projectSafeExecutionFailure(phase);
};
