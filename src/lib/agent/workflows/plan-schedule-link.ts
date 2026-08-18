import { createHash } from "node:crypto";

import { commitTransaction, createLocalReq, initTransaction } from "payload";
import type { Payload } from "payload";

import { getCurrentAgentUserId } from "../execution-context";
import type { ScheduleModelInvocationOptions } from "../schedule/model-invocation";
import {
  formatFrozenScheduleItemTitle,
  frozenSchedulePlanProposalSchema,
  type FrozenSchedulePlanProposal,
  type PlanScheduleDraft,
} from "../schedule/model-schemas";
import type { SchedulePlanArgs } from "../schemas";
import {
  createScheduleItem,
  getScheduleForDateRange,
  type ScheduleItemInput,
  type ScheduleItemRecord,
} from "@/lib/schedule/items";
import type { Plan } from "@/payload-types";

import type { DecomposedPhase } from "./plan-decomposer";
import {
  buildPlanScheduleTaskManifest,
  materializePlanScheduleDraft,
  planSmartScheduleWithLLM,
  validateFrozenSchedulePlanProposalAgainstOccupied,
  type OccupiedScheduleSlot,
  type PlanScheduleDraftInput,
  type ScheduleGenerationOptions,
} from "./plan-schedule-llm";

export type { ScheduleGenerationOptions } from "./plan-schedule-llm";

const DAY_MS = 24 * 60 * 60 * 1_000;
const HORIZON_DAYS = 60;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const buildSchedulePlanSourceFingerprint = (
  plan: Pick<Plan, "id" | "phases" | "priority" | "title">,
): string => createHash("sha256")
  .update(JSON.stringify({
    id: plan.id,
    phases: plan.phases ?? null,
    priority: plan.priority ?? null,
    title: plan.title,
  }))
  .digest("hex");

const addMinutesToTime = (time: string, minutes: number): string | null => {
  if (!TIME_PATTERN.test(time)) return null;
  const [hours = 0, minute = 0] = time.split(":").map(Number);
  const total = hours * 60 + minute + minutes;
  if (total <= 0 || total >= 24 * 60) return null;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const normalizeOptions = (args: SchedulePlanArgs): ScheduleGenerationOptions => ({
  defaultDurationMinutes:
    Number.isInteger(args.defaultDurationMinutes)
      && (args.defaultDurationMinutes ?? 0) >= 15
      && (args.defaultDurationMinutes ?? 0) <= 720
      ? args.defaultDurationMinutes!
      : 90,
  defaultStartTime:
    args.defaultStartTime && TIME_PATTERN.test(args.defaultStartTime)
      ? args.defaultStartTime
      : "09:00",
  startDate: args.startDate ?? dateKey(new Date()),
});

const buildRuleBasedSchedulePlanProposal = (
  input: PlanScheduleDraftInput,
): FrozenSchedulePlanProposal | null => {
  const tasks = buildPlanScheduleTaskManifest(input.phases);
  const start = new Date(`${input.options.startDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || tasks.length === 0) return null;
  const endTime = addMinutesToTime(
    input.options.defaultStartTime,
    input.options.defaultDurationMinutes,
  );
  if (!endTime) return null;

  const occupied = [...input.occupiedSlots];
  const items: PlanScheduleDraft["items"] = [];
  let cursor = new Date(start);

  for (const task of tasks) {
    let placed = false;
    while (cursor.getTime() <= start.getTime() + HORIZON_DAYS * DAY_MS) {
      const candidate = {
        date: dateKey(cursor),
        endTime,
        isAllDay: false,
        startTime: input.options.defaultStartTime,
        taskKey: task.taskKey,
      };
      const conflicts = occupied.some((slot) =>
        slot.date === candidate.date
        && (
          slot.isAllDay
          || !slot.startTime
          || !slot.endTime
          || candidate.startTime < slot.endTime && slot.startTime < candidate.endTime
        ),
      );
      if (!conflicts) {
        items.push(candidate);
        occupied.push({ ...candidate, title: task.title });
        placed = true;
        cursor = new Date(cursor.getTime() + DAY_MS);
        break;
      }
      cursor = new Date(cursor.getTime() + DAY_MS);
    }

    if (!placed) return null;
  }

  return materializePlanScheduleDraft({
    draft: { items },
    input,
    source: "deterministic",
  });
};

const readOccupiedSlots = async (
  startDate: string,
  payload: Payload,
  req?: unknown,
): Promise<OccupiedScheduleSlot[]> => {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) return [];
  const end = new Date(start.getTime() + HORIZON_DAYS * DAY_MS);
  const items = await getScheduleForDateRange(start, end, payload, req);
  return items
    .filter((item) => item.status !== "canceled")
    .map((item) => ({
      date: item.date.slice(0, 10),
      endTime: item.endTime ?? null,
      isAllDay: item.isAllDay ?? false,
      startTime: item.startTime ?? null,
      title: item.title,
    }));
};

export const prepareSchedulePlanProposalFromPayload = async (
  args: SchedulePlanArgs,
  payload: Payload,
  invocation: ScheduleModelInvocationOptions = {},
): Promise<FrozenSchedulePlanProposal | null> => {
  const existing = frozenSchedulePlanProposalSchema.safeParse(args.proposal);

  let plan: Plan | null;
  try {
    plan = await payload.findByID({
      collection: "plans",
      disableErrors: true,
      id: args.planId,
      overrideAccess: true,
    });
  } catch {
    return null;
  }
  if (!plan) return null;

  const phases = plan.phases as DecomposedPhase[] | null | undefined;
  if (!Array.isArray(phases) || phases.length === 0) return null;

  const options = normalizeOptions(args);
  const occupiedSlots = await readOccupiedSlots(options.startDate, payload);
  if (
    existing.success
    && existing.data.planId === plan.id
    && existing.data.planTitle === plan.title
    && existing.data.planFingerprint === buildSchedulePlanSourceFingerprint(plan)
    && validateFrozenSchedulePlanProposalAgainstOccupied(existing.data, occupiedSlots)
  ) {
    return existing.data;
  }
  const input: PlanScheduleDraftInput = {
    occupiedSlots,
    options,
    phases,
    planFingerprint: buildSchedulePlanSourceFingerprint(plan),
    planId: plan.id,
    planPriority: plan.priority,
    planTitle: plan.title,
  };

  return await planSmartScheduleWithLLM(input, invocation)
    ?? buildRuleBasedSchedulePlanProposal(input);
};

export const isFrozenSchedulePlanProposalCurrentlySafe = async (
  proposal: FrozenSchedulePlanProposal,
  payload: Payload,
  currentPlan?: Plan | null,
): Promise<boolean> => {
  const parsed = frozenSchedulePlanProposalSchema.safeParse(proposal);
  if (!parsed.success) return false;
  const plan = currentPlan ?? await payload.findByID({
    collection: "plans",
    disableErrors: true,
    id: parsed.data.planId,
    overrideAccess: true,
  }) as Plan | null;
  if (
    !plan
    || parsed.data.planTitle !== plan.title
    || parsed.data.planFingerprint !== buildSchedulePlanSourceFingerprint(plan)
  ) {
    return false;
  }
  const occupied = await readOccupiedSlots(parsed.data.startDate, payload);
  return validateFrozenSchedulePlanProposalAgainstOccupied(parsed.data, occupied);
};

export type CreatedSchedulePlanItem = {
  date: string;
  id: number;
  phaseTitle: string;
  title: string;
};

type ScheduleItemCreator = (
  input: ScheduleItemInput,
) => Promise<ScheduleItemRecord>;

const itemInput = (
  plan: Plan,
  item: FrozenSchedulePlanProposal["items"][number],
): ScheduleItemInput => ({
  agentBrief: `智能排期：${item.phaseTitle}`,
  createdBy: "agent",
  date: item.date,
  description: `从计划「${plan.title}」的确认排期草案生成。`,
  endTime: item.endTime,
  isAllDay: item.isAllDay,
  priority: plan.priority as "high" | "low" | "medium",
  relatedPlan: plan.id,
  sourceType: "plan",
  startTime: item.startTime,
  status: "planned",
  title: formatFrozenScheduleItemTitle(item),
});

const persistWithCreator = async (
  plan: Plan,
  proposal: FrozenSchedulePlanProposal,
  createItem: ScheduleItemCreator,
): Promise<CreatedSchedulePlanItem[]> => {
  const created: CreatedSchedulePlanItem[] = [];
  for (const item of proposal.items) {
    const input = itemInput(plan, item);
    const document = await createItem(input);
    created.push({
      date: item.date,
      id: document.id,
      phaseTitle: item.phaseTitle,
      title: input.title,
    });
  }
  return created;
};

const rollbackTransaction = async (
  payload: Payload,
  req: { transactionID?: number | Promise<number | string> | string },
) => {
  if (req.transactionID == null) return;
  await payload.db.rollbackTransaction(await req.transactionID);
  delete req.transactionID;
};

export class SchedulePlanPersistenceIndeterminateError extends Error {
  constructor(cause?: unknown) {
    super("Schedule plan persistence rollback failed.", { cause });
    this.name = "SchedulePlanPersistenceIndeterminateError";
  }
}

export const runSchedulePlanPersistenceTransaction = async <T>({
  commit,
  operation,
  rollback,
}: {
  commit: () => Promise<void>;
  operation: () => Promise<T>;
  rollback: () => Promise<void>;
}): Promise<T> => {
  let result: T;
  try {
    result = await operation();
  } catch (error) {
    try {
      await rollback();
    } catch {
      throw new SchedulePlanPersistenceIndeterminateError(error);
    }
    throw error;
  }

  try {
    await commit();
    return result;
  } catch (error) {
    try {
      await rollback();
    } catch {
      throw new SchedulePlanPersistenceIndeterminateError(error);
    }
    throw error;
  }
};

export const persistFrozenSchedulePlanProposal = async (
  plan: Plan,
  proposal: FrozenSchedulePlanProposal,
  dependencies: {
    createItem?: ScheduleItemCreator;
    payload?: Payload;
  } = {},
): Promise<CreatedSchedulePlanItem[]> => {
  const parsed = frozenSchedulePlanProposalSchema.safeParse(proposal);
  if (!parsed.success || parsed.data.planId !== plan.id) {
    throw new Error("Confirmed schedule proposal is invalid.");
  }

  if (dependencies.createItem) {
    return persistWithCreator(plan, parsed.data, dependencies.createItem);
  }
  if (!dependencies.payload) {
    throw new Error("Schedule proposal persistence requires Payload.");
  }

  const userId = getCurrentAgentUserId();
  const req = await createLocalReq(
    userId ? { user: { id: userId } as never } : {},
    dependencies.payload,
  );
  const started = await initTransaction(req);
  if (!started) throw new Error("Schedule proposal transaction is unavailable.");

  return runSchedulePlanPersistenceTransaction({
    commit: () => commitTransaction(req),
    operation: () => persistWithCreator(
      plan,
      parsed.data,
      (input) => createScheduleItem(input, dependencies.payload, req),
    ),
    rollback: () => rollbackTransaction(dependencies.payload!, req),
  });
};

export const persistFrozenSchedulePlanProposalWithAudit = async <TAudit>(
  plan: Plan,
  proposal: FrozenSchedulePlanProposal,
  createAudit: (
    items: CreatedSchedulePlanItem[],
    payload: Pick<Payload, "create">,
  ) => Promise<TAudit>,
  dependencies: { payload: Payload },
): Promise<{ audit: TAudit; items: CreatedSchedulePlanItem[] }> => {
  const parsed = frozenSchedulePlanProposalSchema.safeParse(proposal);
  if (!parsed.success || parsed.data.planId !== plan.id) {
    throw new Error("Confirmed schedule proposal is invalid.");
  }

  const userId = getCurrentAgentUserId();
  const req = await createLocalReq(
    userId ? { user: { id: userId } as never } : {},
    dependencies.payload,
  );
  const started = await initTransaction(req);
  if (!started) throw new Error("Schedule proposal transaction is unavailable.");

  const transactionPayload = {
    create: (args: unknown) => dependencies.payload.create({
      ...(args as Record<string, unknown>),
      req,
    } as never),
  } as Pick<Payload, "create">;

  return runSchedulePlanPersistenceTransaction({
    commit: () => commitTransaction(req),
    operation: async () => {
      const currentPlan = await dependencies.payload.findByID({
        collection: "plans",
        disableErrors: true,
        id: parsed.data.planId,
        overrideAccess: true,
        req,
      }) as Plan | null;
      if (
        !currentPlan
        || parsed.data.planTitle !== currentPlan.title
        || parsed.data.planFingerprint !== buildSchedulePlanSourceFingerprint(currentPlan)
      ) {
        throw new Error("Confirmed schedule proposal source changed.");
      }
      const occupiedSlots = await readOccupiedSlots(
        parsed.data.startDate,
        dependencies.payload,
        req,
      );
      if (!validateFrozenSchedulePlanProposalAgainstOccupied(parsed.data, occupiedSlots)) {
        throw new Error("Confirmed schedule proposal conflicts with the current calendar.");
      }
      const items = await persistWithCreator(
        currentPlan,
        parsed.data,
        (input) => createScheduleItem(input, dependencies.payload, req),
      );
      const audit = await createAudit(items, transactionPayload);
      return { audit, items };
    },
    rollback: () => rollbackTransaction(dependencies.payload, req),
  });
};

export const summarizeScheduleGeneration = (
  items: Array<{ date: string; phaseTitle: string; title: string }>,
): string => {
  if (items.length === 0) return "未能生成任何日程条目。";
  const firstDate = items[0]?.date ?? "";
  const lastDate = items[items.length - 1]?.date ?? "";
  const phases = [...new Set(items.map((item) => item.phaseTitle))];
  return `已生成 ${items.length} 条日程，覆盖 ${phases.length} 个阶段，时间范围：${firstDate} 至 ${lastDate}`;
};
