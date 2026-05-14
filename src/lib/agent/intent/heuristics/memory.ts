import { createClarifyIntent, type AgentIntent } from "../../schemas";
import { memoryKeywords } from "./keywords";
import { cleanupText } from "./shared-text";

export const inferMemoryType = (content: string): NonNullable<Extract<AgentIntent, { intent: "save_memory" }>["args"]["type"]> => {
  if (/(风格|语气|口吻|写作|文案)/.test(content)) {
    return "writing_style";
  }

  if (/(规则|流程|工作流|以后都|每次都|不要|必须|优先)/.test(content)) {
    return "workflow_rule";
  }

  if (/(项目|SunnyPanel|站点|产品|功能|代码库)/i.test(content)) {
    return "project_context";
  }

  if (/(偏好|喜欢|倾向|希望|习惯|以后|记住)/.test(content)) {
    return "preference";
  }

  return "fact";
};

export const parseSaveMemoryIntent = (message: string): AgentIntent | null => {
  const keyword = memoryKeywords.find((item) => message.includes(item));

  if (!keyword) {
    return null;
  }

  const content = cleanupText(
    message
      .slice(message.indexOf(keyword) + keyword.length)
      .replace(/^(一下|这个|这点|这条|：|:|，|,)/, ""),
  );

  if (!content) {
    return createClarifyIntent("你想让我长期记住什么？请用一句话说明偏好、规则、写作风格或项目事实。", [
      "content",
    ]);
  }

  const type = inferMemoryType(content);

  return {
    args: {
      confidence: 0.75,
      content,
      title: content.length <= 36 ? content : `${content.slice(0, 36).trimEnd()}...`,
      type,
    },
    confidence: 0.72,
    intent: "save_memory",
  };
};
