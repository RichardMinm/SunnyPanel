import type {
  OrchestratorOutput,
} from "../llm/schemas/orchestrator-output";
import type { OrchestratorPlan } from "./types";

export type RequestSemanticBoundaryErrorCode =
  | "imperative_completion_non_write"
  | "unfinished_items_schedule_non_clarify";

export type RequestSemanticBoundaryResult =
  | Readonly<{ valid: true }>
  | Readonly<{
      code: RequestSemanticBoundaryErrorCode;
      valid: false;
    }>;

const normalize = (message: string): string =>
  message.normalize("NFKC").trim().replace(/\s+/gu, " ");

const NON_IMPERATIVE_COMPLETION_CUE =
  /(?:如何|怎么|怎样|为什么|建议|方法|教程|完成情况|完成度|进度|是否|有没有|能否|可不可以|完成了吗|完成了没|[?？])/u;

const IMPERATIVE_COMPLETION_CUE =
  /^(?:(?:请|麻烦)(?:你)?\s*)?(?:帮(?:我|忙)\s*)?(?:完成(?:一下)?\s*.+|(?:把|将)\s*.+(?:标记为完成|设为完成|完成(?:一下|掉|了)?))[。！!]?$/u;

const UNFINISHED_ITEMS_CUE =
  /(?:未完成|没完成|尚未完成)(?:的|项|条目|任务|部分)?/u;

const NON_IMPERATIVE_SCHEDULING_CUE =
  /(?:如何|怎么|怎样|为什么|建议|方法|教程|是否|能否|能不能|可不可以|[?？])/u;

const FUTURE_SCHEDULING_CUE =
  /(?:排|安排|放|挪|移|推迟|延后)\s*(?:(?:到|至|在|入|进)\s*)?(?:下周|本周|这周|明天|后天|周[一二三四五六日天]|未来|之后)/u;

const EXPLICIT_SCHEDULE_ITEM_REFERENCE =
  /(?:日程(?:项)?|schedule\s*item)\s*(?:(?:id|编号|#)\s*[:：#]?\s*)?\d+(?:(?:\s*(?:、|,|，|和|及|与|and)\s*)(?:(?:id|编号|#)\s*[:：#]?\s*)?\d+)*/giu;

const hasClarifyOnly = (output: OrchestratorOutput): boolean =>
  output.mode === "single"
  && output.tasks.length === 1
  && output.tasks[0]?.intent === "clarify"
  && typeof output.tasks[0].args.question === "string"
  && output.tasks[0].args.question.trim().length > 0;

const isImperativeCompletion = (message: string): boolean =>
  !NON_IMPERATIVE_COMPLETION_CUE.test(message)
  && IMPERATIVE_COMPLETION_CUE.test(message);

const isUnfinishedItemsScheduling = (message: string): boolean =>
  !NON_IMPERATIVE_SCHEDULING_CUE.test(message)
  && UNFINISHED_ITEMS_CUE.test(message)
  && FUTURE_SCHEDULING_CUE.test(message);

const hasExactCompletionOutcome = (output: OrchestratorOutput): boolean =>
  output.mode === "single"
  && output.tasks.length === 1
  && output.tasks[0]?.intent === "complete_plan_item";

const explicitScheduleItemIds = (message: string): readonly number[] => {
  const ids = new Set<number>();
  for (const match of message.matchAll(EXPLICIT_SCHEDULE_ITEM_REFERENCE)) {
    for (const rawId of match[0].match(/\d+/gu) ?? []) {
      const value = Number(rawId);
      if (Number.isInteger(value) && value > 0) ids.add(value);
    }
  }
  return Object.freeze([...ids]);
};

const hasExactRescheduleOutcome = (
  message: string,
  output: OrchestratorOutput,
): boolean => {
  if (
    output.mode !== "single"
    || output.tasks.length !== 1
    || output.tasks[0]?.intent !== "reschedule_item"
  ) {
    return false;
  }
  const itemId = output.tasks[0].args.itemId;
  const explicitIds = explicitScheduleItemIds(message);
  return (
    typeof itemId === "number"
    && Number.isInteger(itemId)
    && itemId > 0
    && explicitIds.length === 1
    && explicitIds[0] === itemId
  );
};

/**
 * Negative-only semantic validation for explicit existing-resource mutations.
 *
 * This boundary never selects a write intent or repairs Provider output. It
 * only prevents an explicit mutation from being downgraded to consultation,
 * read, or an unrelated new-resource draft. Existing-target write candidates
 * continue to the schedule/reference and Resource Readiness validators.
 */
export const validateRequestSemanticBoundary = (
  input: Readonly<{
    message: string;
    output: OrchestratorOutput;
  }>,
): RequestSemanticBoundaryResult => {
  const message = normalize(input.message);

  if (
    isImperativeCompletion(message)
    && !hasClarifyOnly(input.output)
    && !hasExactCompletionOutcome(input.output)
  ) {
    return Object.freeze({
      code: "imperative_completion_non_write",
      valid: false,
    });
  }

  if (
    isUnfinishedItemsScheduling(message)
    && !hasClarifyOnly(input.output)
    && !hasExactRescheduleOutcome(message, input.output)
  ) {
    return Object.freeze({
      code: "unfinished_items_schedule_non_clarify",
      valid: false,
    });
  }

  return Object.freeze({ valid: true });
};

const questionByCode = Object.freeze({
  imperative_completion_non_write:
    "请提供要完成的准确清单名称和具体条目，以便安全定位已有资源。",
  unfinished_items_schedule_non_clarify:
    "请确认要排到后续日期的具体计划、清单条目或已有日程。",
} satisfies Record<RequestSemanticBoundaryErrorCode, string>);

export type RequestSemanticBoundaryClarificationProjection = Readonly<{
  plan: OrchestratorPlan;
  requestSemanticBoundaryErrorCode: RequestSemanticBoundaryErrorCode;
}>;

export const projectRequestSemanticBoundaryToClarification = (
  code: RequestSemanticBoundaryErrorCode,
): RequestSemanticBoundaryClarificationProjection => {
  const dependsOn: string[] = [];
  Object.freeze(dependsOn);
  const plan: OrchestratorPlan = {
    mode: "single",
    reasoning:
      "确定性请求语义澄清：已有资源操作未通过意图完整性校验。",
    source: "llm",
    tasks: [{
      agentRole: "query",
      args: Object.freeze({ question: questionByCode[code] }),
      dependsOn,
      id: "t1",
      intent: "clarify",
      label: "确认已有资源操作",
    }],
  };

  Object.freeze(plan.tasks);
  Object.freeze(plan);
  return Object.freeze({
    plan,
    requestSemanticBoundaryErrorCode: code,
  });
};
