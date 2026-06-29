import type { DeleteRecordArgs, ModifyRecordArgs } from "../schemas";
import {
  resolveDeleteRecordTarget,
  type DeleteRecordCollection,
  type DeleteRecordTarget,
} from "../tools/delete-record";
import {
  resolveModifyRecordTarget,
  type ModifyRecordTarget,
} from "../tools/modify-record";

export type TargetResolutionStatus = "ambiguous" | "multiple" | "not_found" | "unique";

/** 对外别名：multiple 与 ambiguous 等价 */
export const normalizeTargetResolutionStatus = (
  status: TargetResolutionStatus,
): "multiple" | "not_found" | "unique" => {
  if (status === "ambiguous" || status === "multiple") {
    return "multiple";
  }

  return status;
};

export type TargetResolutionResult<T> = {
  question: null | string;
  resolved: null | T;
  status: TargetResolutionStatus;
};

const statusFromResolution = <T>(resolution: {
  question: null | string;
  resolved: null | T;
}): TargetResolutionResult<T> => {
  if (resolution.resolved) {
    return { ...resolution, status: "unique" };
  }

  const question = resolution.question ?? "";

  if (/多个匹配|找到多个/.test(question)) {
    return { ...resolution, status: "multiple" as TargetResolutionStatus };
  }

  return { ...resolution, status: "not_found" };
};

export const resolveDeleteTarget = async (
  args: DeleteRecordArgs,
  options: { payload?: unknown } = {},
): Promise<TargetResolutionResult<DeleteRecordTarget>> =>
  statusFromResolution(await resolveDeleteRecordTarget(args, options));

export const resolveModifyTarget = async (
  args: ModifyRecordArgs,
): Promise<TargetResolutionResult<ModifyRecordTarget>> =>
  statusFromResolution(await resolveModifyRecordTarget(args));

export const collectionLabel = (collection: DeleteRecordCollection) => {
  const map: Record<DeleteRecordCollection, string> = {
    checklists: "清单",
    plans: "计划",
    "schedule-items": "日程",
    "timeline-events": "时间线",
  };

  return map[collection];
};

/** not_found / ambiguous 时禁止进入 dryRun 提案阶段。 */
export const canDryRunWithTarget = (status: TargetResolutionStatus) => status === "unique";
