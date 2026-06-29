import { parseCapabilityQueryIntent } from "../intent/heuristics/query";
import type { LLMRouterOutput } from "./llm-router-schema";

const capabilityQuestionPattern =
  /(你能做什么|你可以做什么|支持什么|有哪些功能|能帮我做什么|可以删除|可以创建|支持删除|支持创建|能不能删|能不能创建|可以安排|支持安排)/;

export const routeCapabilityRouter = (message: string): LLMRouterOutput | null => {
  const heuristic = parseCapabilityQueryIntent(message);

  if (!heuristic && !capabilityQuestionPattern.test(message)) {
    return null;
  }

  const asksDelete = /(删除|删掉|移除)/.test(message);
  const asksCreate = /(创建|新建|安排|添加)/.test(message);
  const asksSchedule = /(日程|安排)/.test(message);
  const asksPlan = /(计划)/.test(message);

  let target: LLMRouterOutput["target"] = "agent";

  if (asksDelete && asksPlan) {
    target = "plan";
  } else if (asksDelete && asksSchedule) {
    target = "schedule";
  } else if (asksCreate && asksSchedule) {
    target = "schedule";
  } else if (asksCreate && asksPlan) {
    target = "plan";
  }

  return {
    action: "capability",
    confidence: 0.92,
    needsClarification: false,
    requiresConfirmation: false,
    riskLevel: "none",
    slots: { sourceText: message },
    target,
    userVisibleReason: "用户在询问 Agent 能力边界，本轮只读说明，不触发 preview/execute。",
    writeRequired: false,
  };
};
