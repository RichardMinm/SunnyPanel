import type { AgentChatMessage, AgentChatResponse } from "@/lib/agent/schemas";

export const initialMessages: AgentChatMessage[] = [
  {
    content: "直接告诉我你想推进什么，我会把它整理成计划、清单或进度动作。",
    role: "assistant",
  },
];

export const thinkingStatusKeywords = [
  "解析", "执行", "评估", "处理中", "整理", "生成", "恢复",
  "加载", "分析", "识别", "预检", "确认", "取消", "写入", "组织",
  "Dry-run", "意图",
];

export const engineLabelMap: Record<AgentChatResponse["engine"], string> = {
  glm: "GLM 解析",
  heuristic: "规则解析",
  model: "模型解析",
  openai: "OpenAI 解析",
  "openai-compatible": "兼容模型解析",
  workflow: "流程接力",
  zai: "Z.ai 解析",
};
