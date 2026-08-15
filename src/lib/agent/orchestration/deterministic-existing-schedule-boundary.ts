import type { AgentPromptContext } from "../prompts";
import type { AgentIntent } from "../schemas";

type AuthenticatedActor = Readonly<{
  collection: string;
  id: number;
}>;

type ExactScheduleCompletionInput = Readonly<{
  authenticatedActor: AuthenticatedActor;
  context: Pick<AgentPromptContext, "schedules" | "workbenchMode">;
  originalRequest: string;
}>;

type ExactScheduleCompletionIntent = Extract<
  AgentIntent,
  { intent: "modify_record" }
>;

const exactScheduleCompletionPattern =
  /^(?:将|把)日程\s*#([1-9]\d*)\s*「([^」\r\n]+)」\s*(?:标记为|设为)完成[。.!！]?$/u;

const normalizeContractText = (value: string): string =>
  value.normalize("NFKC").trim();

/**
 * Deterministic boundary for an already-authorized, already-identified
 * Schedule. This is intentionally narrower than intent routing: it never
 * searches by title, selects a workspace resource, or interprets extra text.
 */
export const resolveExactScheduleCompletionIntent = ({
  authenticatedActor,
  context,
  originalRequest,
}: ExactScheduleCompletionInput): ExactScheduleCompletionIntent | null => {
  if (
    authenticatedActor.collection !== "users"
    || !Number.isSafeInteger(authenticatedActor.id)
    || authenticatedActor.id <= 0
    || (context.workbenchMode !== "ask" && context.workbenchMode !== "execute")
  ) {
    return null;
  }

  const match = normalizeContractText(originalRequest).match(
    exactScheduleCompletionPattern,
  );
  if (!match) return null;

  const scheduleId = Number(match[1]);
  const requestedTitle = normalizeContractText(match[2]);
  if (!Number.isSafeInteger(scheduleId) || requestedTitle.length === 0) {
    return null;
  }

  const matchingSchedules = (context.schedules ?? []).filter(
    (schedule) => schedule.id === scheduleId,
  );
  if (matchingSchedules.length !== 1) return null;

  const schedule = matchingSchedules[0];
  if (
    schedule.status !== "planned"
    || normalizeContractText(schedule.title) !== requestedTitle
  ) {
    return null;
  }

  return {
    args: {
      changeDescription: "标记为完成",
      entityName: schedule.title,
      entityType: "schedule",
      patch: { status: "done" },
      targetId: schedule.id,
    },
    confidence: 1,
    intent: "modify_record",
  };
};
