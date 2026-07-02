import type { AgentIntent } from "@/lib/agent/schemas";

export const buildIntentTraceSummary = (intent: AgentIntent): { detail?: string; title: string } => {
  switch (intent.intent) {
    case "answer_question":
      return {
        detail: intent.args.suggestAction ?? "直接回答用户问题，不执行数据库写入。",
        title: "识别为直接回答",
      };
    case "create_plan":
      return {
        detail: intent.args.description ?? "将创建一条新的私有计划记录。",
        title: `识别为创建计划：${intent.args.title}`,
      };
    case "append_plan_item":
      return {
        detail: `${intent.args.checklistTitle}${intent.args.groupTitle ? ` / ${intent.args.groupTitle}` : ""}`,
        title: `识别为追加计划项：${intent.args.itemTitle}`,
      };
    case "complete_plan_item":
      return {
        detail: `${intent.args.checklistTitle}${intent.args.groupTitle ? ` / ${intent.args.groupTitle}` : ""}`,
        title: `识别为完成清单项：${intent.args.itemTitle}`,
      };
    case "compose_plan":
      return {
        detail: intent.args.goal ?? intent.args.sourceText ?? intent.args.title ?? "将生成完整计划提案。",
        title: "识别为 Plan Composer",
      };
    case "compose_schedule_item":
      return {
        detail: intent.args.sourceText ?? intent.args.title ?? "将生成日程提案。",
        title: "识别为 Schedule Composer",
      };
    case "compose_timeline_event":
      return {
        detail: intent.args.sourceTitle ?? intent.args.sourceText ?? intent.args.itemTitle ?? "需要定位 Timeline 来源",
        title: "识别为 Timeline Composer",
      };
    case "add_completion_note":
      return {
        detail: `${intent.args.checklistTitle}${intent.args.groupTitle ? ` / ${intent.args.groupTitle}` : ""}`,
        title: `识别为补完成备注：${intent.args.itemTitle}`,
      };
    case "query_progress":
      return {
        detail: intent.args.checklistTitle ? `目标清单：${intent.args.checklistTitle}` : "范围：整体进度",
        title: "识别为进度查询",
      };
    case "query_plan_progress":
      return {
        detail: intent.args.planId ? `计划ID：${intent.args.planId}` : intent.args.planTitle ?? "查询计划进度",
        title: "识别为计划进度查询",
      };
    case "schedule_plan":
      return {
        detail: intent.args.planId ? `计划ID：${intent.args.planId}` : "将计划排入日程",
        title: "识别为计划排期",
      };
    case "evaluate_plan":
      return {
        detail: intent.args.planTitle ? `目标计划：${intent.args.planTitle}` : "范围：全部计划",
        title: "识别为计划评估",
      };
    case "save_memory":
      return {
        detail: intent.args.content,
        title: `识别为保存长期记忆：${intent.args.title ?? intent.args.type ?? "memory"}`,
      };
    case "weekly_review":
      return {
        detail: intent.args.persistReview === false ? "仅预览本周回顾，不写入 PlanReview。" : "将生成本周回顾并在确认后保存为 PlanReview。",
        title: "识别为本周回顾",
      };
    case "reschedule_item":
      return {
        detail: intent.args.reason ?? `改期日程 #${intent.args.itemId}`,
        title: "识别为日程改期",
      };
    case "cancel_schedule_item":
      return {
        detail: intent.args.reason ?? `取消日程 #${intent.args.itemId}`,
        title: "识别为取消日程",
      };
    case "clarify":
    default:
      return {
        detail: "question" in intent.args ? intent.args.question : "需要进一步澄清输入",
        title: "需要进一步澄清输入",
      };
  }
};
