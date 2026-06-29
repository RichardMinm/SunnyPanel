import {
  buildDefinitionAnswer,
  buildExpandedDefinitionAnswer,
  lookupKnownSubjectByTopic,
  resolveSubjectByTopic,
} from "../intent/heuristics/knowledge";
import type { AgentIntent } from "../schemas";
import type { AgentConversationState, ConversationalAnswerArgs, ConversationalIntentName } from "./types";

const subjectTopicKey = (subject: ReturnType<typeof resolveSubjectByTopic>) =>
  `${subject.canonical}${subject.aliases.join("")}`;

const buildExamplesAnswer = (subject: ReturnType<typeof resolveSubjectByTopic>) => {
  const topicKey = subjectTopicKey(subject);

  if (/ctf|夺旗/i.test(topicKey)) {
    return `${subject.canonical} 的例子：

1. **Jeopardy Web 题**：页面存在 SQL 注入，提交 ' or 1=1-- 绕过登录后，在响应或源码中找到 flag。
2. **Misc 编码题**：给出一串 Base64/十六进制混合文本，解码多层后得到 flag。
3. **Crypto 弱密钥题**：RSA 的 n 可分解，恢复私钥后解密 flag 密文。
4. **Forensics 流量题**：下载 pcap，从 HTTP 或 DNS 流量里提取隐藏 flag。

这些例子说明 CTF 考的是「在约束下找 flag」，不是背定义。`;
  }

  if (/信息安全|网络安全|网安|蓝队/.test(topicKey)) {
    return `${subject.canonical} 的实际场景例子：

1. **钓鱼邮件**：用户点击恶意链接，蓝队从邮件网关告警 + 终端日志确认是否中招。
2. **Web 漏洞**：WAF 报 SQLi，研判是误报还是真实攻击，必要时联动应用 owner 修洞。
3. **勒索事件**：多台主机文件被加密，应急响应隔离主机、保留镜像、走备份恢复。
4. **账号异常登录**：SIEM 关联多地登录，判断是撞库还是凭证泄露，触发 MFA 或封禁。`;
  }

  return `关于${subject.canonical}，举三个典型场景：

1. 入门：用一个小练习验证你是否理解核心概念。
2. 进阶：把概念应用到变式问题或小型项目。
3. 综合：在真实约束下（时间、工具、信息不全）完成一次完整任务。`;
};

const buildCompareAnswer = (subject: ReturnType<typeof resolveSubjectByTopic>) => {
  const topicKey = subjectTopicKey(subject);

  if (/ctf|夺旗/i.test(topicKey)) {
    return `**CTF vs 真实安全工作**

| 维度 | CTF | 真实安全 |
| --- | --- | --- |
| 目标 | 在赛题环境中拿 flag | 保护业务、检测与响应真实威胁 |
| 环境 | 授权、可控、常带 writeup |  messy、合规约束多、影响面大 |
| 技能 | 解题速度、工具熟练、题型套路 | 流程、协作、风险权衡、长期运营 |

CTF 是训练场，不是生产环境的完整映射；但解题思路（排查、假设验证、工具链）可迁移。`;
  }

  return `要把「${subject.canonical}」和其他概念对比，需要先明确你在对比哪一组（例如 CTF vs 渗透测试、网安 vs 开发）。你可以直接说「A 和 B 有什么区别」。`;
};

const buildSummaryAnswer = (subject: ReturnType<typeof resolveSubjectByTopic>, summary: string) =>
  `**${subject.canonical} · 简要总结**

${summary || "上一轮已给出定义与结构，这里压缩为要点。"}

如需展开某一块，可以说「展开 Web 方向」或「我需要更加详细的信息」。`;

const buildRewriteAnswer = (subject: ReturnType<typeof resolveSubjectByTopic>, previousSummary: string) =>
  `换个说法理解${subject.canonical}：

${previousSummary || `${subject.canonical} 是一组围绕「${subject.focus.slice(0, 3).join("、")}」展开的知识与实践。`}

如果这种表述还不清楚，告诉我你卡在哪一层（定义、例子还是怎么练）。`;

const buildLearningPathAnswer = (subject: ReturnType<typeof resolveSubjectByTopic>) => {
  const sequence = subject.sequence.map((step, index) => `${index + 1}. ${step}`).join("\n");

  return `${subject.canonical} 的学习路径（只读建议，不写入计划）：

${sequence}

练习节奏：每完成一小节做 3–5 题自检；每 2–3 天混合复盘一次。若要落成可确认的学习计划或清单，请明确说「帮我制定计划」。`;
};

export const generateConversationalAnswer = (
  kind: ConversationalIntentName,
  topic: string,
  state?: AgentConversationState | null,
): string => {
  if (state?.answerMode === "open") {
    return "";
  }

  const known = lookupKnownSubjectByTopic(topic);

  if (!known && (kind === "expand_answer" || kind === "explain_concept")) {
    return "";
  }

  const subject = known ?? resolveSubjectByTopic(topic);

  switch (kind) {
    case "expand_answer":
      return buildExpandedDefinitionAnswer(subject);
    case "give_examples":
      return buildExamplesAnswer(subject);
    case "compare_concepts":
      return buildCompareAnswer(subject);
    case "summarize_answer":
      return buildSummaryAnswer(subject, state?.lastAssistantAnswerSummary ?? "");
    case "rewrite_answer":
      return buildRewriteAnswer(subject, state?.lastAssistantAnswerSummary ?? "");
    case "give_learning_path":
      return buildLearningPathAnswer(subject);
    case "explain_concept":
      return buildDefinitionAnswer(subject);
    default:
      return buildExpandedDefinitionAnswer(subject);
  }
};

export const buildConversationalIntent = (
  kind: ConversationalIntentName,
  topic: string,
  message: string,
  state?: AgentConversationState | null,
): Extract<AgentIntent, { intent: ConversationalIntentName }> => {
  const known = lookupKnownSubjectByTopic(topic);
  const subject = known ?? resolveSubjectByTopic(topic);
  const answer = generateConversationalAnswer(kind, topic, state);
  const args: ConversationalAnswerArgs = {
    answer,
    learningContext: {
      originalMessage: message,
      subject: subject.canonical,
    },
    requiresConfirmation: false,
    riskLevel: "none",
    suggestAction:
      kind === "expand_answer" || kind === "explain_concept"
        ? `如果你还想了解${subject.canonical}的学习路径，可以直接说「怎么学」。`
        : null,
    target: "last_topic",
    topic: subject.canonical.includes("CTF") ? "CTF" : subject.canonical,
    writeRequired: false,
  };

  return {
    args,
    confidence: 0.93,
    intent: kind,
  };
};
