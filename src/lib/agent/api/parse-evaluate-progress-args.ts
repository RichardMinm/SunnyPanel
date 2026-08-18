import type { EvaluatePlanArgs, QueryProgressArgs } from "@/lib/agent/schemas";
import { isRecord } from "@/lib/shared/is-record";

const parseNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

export const parseEvaluatePlanArgs = (value: unknown): EvaluatePlanArgs => {
  if (!isRecord(value)) {
    return {};
  }

  return {
    planId: parseNumber(value.planId),
    planTitle: typeof value.planTitle === "string" ? value.planTitle.trim() || null : null,
  };
};

export const parseEvaluatePlanArgsFromSearchParams = (params: URLSearchParams): EvaluatePlanArgs =>
  parseEvaluatePlanArgs({
    planId: params.get("planId"),
    planTitle: params.get("planTitle"),
  });

/** Plan evaluation is a read-only contract; saving belongs to confirmed weekly_review. */
export const shouldPersistEvaluateReviewFromBody = (_body: unknown) => false;

const parseProgressScope = (value: unknown): QueryProgressArgs["scope"] => {
  if (value === "all" || value === "checklists" || value === "plans") {
    return value;
  }

  return "all";
};

export const parseQueryProgressArgs = (value: unknown): QueryProgressArgs => {
  if (!isRecord(value)) {
    return {
      scope: "all",
    };
  }

  return {
    checklistTitle: typeof value.checklistTitle === "string" ? value.checklistTitle.trim() || null : null,
    scope: parseProgressScope(value.scope),
  };
};

export const parseQueryProgressArgsFromSearchParams = (params: URLSearchParams): QueryProgressArgs =>
  parseQueryProgressArgs({
    checklistTitle: params.get("checklistTitle"),
    scope: params.get("scope"),
  });
