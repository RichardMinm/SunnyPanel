import { routerIntentNameSchema } from "../llm/schemas/router-output";
import type {
  ResidualIntentPolicy,
} from "./hybrid-query-boundary-types";

const RESULT_TO_TASK_DRAFT =
  /(?:记录|整理|转换|转成|生成)[^。！？\n]{0,24}(?:未完成|未完成项)[^。！？\n]{0,24}(?:新任务|任务清单|清单)|(?:未完成|未完成项)[^。！？\n]{0,24}(?:作为|整理为|记录为)[^。！？\n]{0,12}(?:新任务|任务清单|清单)/u;

const INDEPENDENT_CONSULTATION =
  /(?:解释|分析原因|给出建议|提供建议|为什么|怎么办|如何改进)/u;

const POLICY_ALLOWED_INTENTS = Object.freeze([
  "compose_checklist",
] as const);

for (const intent of POLICY_ALLOWED_INTENTS) {
  routerIntentNameSchema.parse(intent);
}

export const QUERY_RESULT_TO_CHECKLIST_DRAFT_POLICY =
  Object.freeze<ResidualIntentPolicy>({
    allowedIntents: POLICY_ALLOWED_INTENTS,
    kind: "query_result_to_checklist_draft",
  });

export const resolveResidualIntentPolicy = (
  originalRequest: string,
): ResidualIntentPolicy | null => {
  const normalized = originalRequest.normalize("NFKC");
  if (
    INDEPENDENT_CONSULTATION.test(normalized)
    || !RESULT_TO_TASK_DRAFT.test(normalized)
  ) {
    return null;
  }
  return QUERY_RESULT_TO_CHECKLIST_DRAFT_POLICY;
};
