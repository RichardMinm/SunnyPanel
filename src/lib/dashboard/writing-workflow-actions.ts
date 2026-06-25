import type { WritingAssistAction } from "@/lib/agent/prompts/writing-assist";

export type WritingWorkflowActionId =
  | "checklist_from_doc"
  | "memory_from_doc"
  | "plan_continue"
  | "plan_from_doc"
  | "schedule_weekly"
  | "timeline_from_doc";

export type WritingWorkflowHandlers = {
  onPrefillComposer?: (prompt: string, mode?: string) => void;
  onToast?: (message: string) => void;
  onWritingAssist?: (action: WritingAssistAction) => void;
};

const workflowPrompts: Record<WritingWorkflowActionId, string> = {
  checklist_from_doc:
    "请根据当前文档内容，生成一份可执行的清单（含具体步骤与优先级），便于我逐项完成。",
  plan_from_doc: "请根据当前文档内容，整理一份结构化计划（目标、里程碑、下一步行动）。",
  memory_from_doc: "请将当前文档的核心信息提炼为一条可长期复用的记忆条目（标题 + 正文）。",
  timeline_from_doc: "请将当前文档中的关键事件或里程碑，整理为一条时间线节点描述。",
  plan_continue: "请结合我当前关联的计划上下文，续写本文的下一部分。",
  schedule_weekly: "请根据我最近一周的日程安排，帮我生成一篇周记草稿。",
};

export function runWritingWorkflowAction(
  id: WritingWorkflowActionId,
  handlers: WritingWorkflowHandlers,
) {
  if (id === "plan_continue") {
    handlers.onWritingAssist?.("continue");
    handlers.onToast?.("已请求根据计划续写");
    return;
  }

  const prompt = workflowPrompts[id];
  handlers.onPrefillComposer?.(prompt, id.includes("plan") ? "plan" : "ask");
  handlers.onToast?.("已发送到 Agent 工作台");
}

export function getWorkflowActionDescription(id: WritingWorkflowActionId): string {
  const descriptions: Record<WritingWorkflowActionId, string> = {
    checklist_from_doc: "把正文拆成可执行清单",
    memory_from_doc: "提炼核心信息写入记忆库",
    plan_continue: "结合计划上下文继续写",
    plan_from_doc: "生成结构化计划与里程碑",
    schedule_weekly: "基于近期日程生成周记",
    timeline_from_doc: "记录成长时间线节点",
  };
  return descriptions[id];
}
