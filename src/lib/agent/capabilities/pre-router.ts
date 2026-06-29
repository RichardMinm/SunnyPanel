import type { AgentConversationState } from "../conversation/types";
import { collectHeuristicCandidates } from "../intent/heuristics";
import { parseCapabilityQueryIntent } from "../intent/heuristics/query";
import { normalizeRouterOutput } from "../router/normalize-router-output";
import type { AgentRouterAction, AgentRouterOutput } from "../router/types";
import type { AgentIntent } from "../schemas";
import { createClarifyIntent } from "../schemas";
import type { UserPreferences } from "../user-preferences";
import type { CapabilityGateInput } from "./types";

const deletePattern = /(删除|删掉|移除|去掉|清除).{0,12}(计划|日程|清单|时间线|条目)/;
const updatePattern = /(修改|更新|改成|改为|调整|暂停|恢复|改到|推迟|提前).{0,12}(计划|日程|清单|时间线|条目|状态|优先级)/;
const createSchedulePattern = /(安排|排进|排入|加入日程|创建日程|加一条|加一个).{0,20}/;
const createPlanPattern = /(创建|新建|制定|生成|做一个).{0,8}(计划|清单)/;
const queryPattern = /(有什么|有哪些|怎么样|查一下|查看|看下|进度|安排)/;

const estimateActionFromMessage = (message: string): AgentRouterAction => {
  if (parseCapabilityQueryIntent(message)) {
    return "capability";
  }

  const candidates = collectHeuristicCandidates(message);
  const top = candidates[0]?.intent;

  if (top) {
    const synthetic = normalizeRouterOutput({ intent: top });

    return synthetic.action;
  }

  if (deletePattern.test(message)) {
    return "delete";
  }

  if (updatePattern.test(message)) {
    return "update";
  }

  if (createSchedulePattern.test(message) || createPlanPattern.test(message)) {
    return "create";
  }

  if (queryPattern.test(message) && !/(创建|新建|删除|修改|安排到)/.test(message)) {
    return "query";
  }

  return "answer";
};

const syntheticIntentForAction = (action: AgentRouterAction, message: string): AgentIntent => {
  if (action === "delete") {
    const planMatch = message.match(/计划/);

    return {
      args: {
        entityName: message.replace(deletePattern, "$1").trim() || "目标",
        entityType: planMatch ? "plan" : "schedule",
      },
      intent: "delete_record",
    };
  }

  if (action === "create") {
    if (createSchedulePattern.test(message)) {
      return {
        args: { date: "", sourceText: message },
        intent: "compose_schedule_item",
      };
    }

    return {
      args: { title: message.slice(0, 40) || "新计划" },
      intent: "create_plan",
    };
  }

  if (action === "update") {
    return {
      args: {
        changeDescription: message,
        entityName: "目标",
        entityType: "plan",
      },
      intent: "modify_record",
    };
  }

  if (action === "capability") {
    return {
      args: { answer: "能力查询" },
      intent: "capability_query",
    };
  }

  if (action === "query") {
    if (/日程|安排/.test(message)) {
      return { args: {}, intent: "query_schedule" };
    }

    return { args: { scope: "all" }, intent: "query_progress" };
  }

  return createClarifyIntent("请补充更多信息。");
};

export const buildPreRouterGateInput = (input: {
  conversationState?: AgentConversationState | null;
  message: string;
  userContext: { preferences?: UserPreferences | null; userId: number };
}): CapabilityGateInput => {
  const action = estimateActionFromMessage(input.message);
  const intent = syntheticIntentForAction(action, input.message);
  const router: AgentRouterOutput = {
    ...normalizeRouterOutput({ intent }),
    action,
    requiresWrite: action === "create" || action === "update" || action === "delete",
  };

  return {
    conversationState: input.conversationState ?? null,
    intent,
    router,
    userContext: input.userContext,
  };
};

export const estimateRouterAction = estimateActionFromMessage;
