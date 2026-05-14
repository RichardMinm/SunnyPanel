import type { AgentIntent } from "../../schemas";

const mathTwoSyllabusAnswer = `考研数学二通常考两门：高等数学和线性代数，不考概率论与数理统计。分值结构一般是高等数学约 80%，线性代数约 20%，具体以当年官方考试大纲为准。

高等数学常见章节：
1. 函数、极限、连续
2. 一元函数微分学
3. 一元函数积分学
4. 多元函数微积分学
5. 常微分方程

线性代数常见章节：
1. 行列式
2. 矩阵
3. 向量
4. 线性方程组
5. 矩阵的特征值和特征向量
6. 二次型`;

const isMathTwoSyllabusQuestion = (message: string) => {
  const isMathTwoQuestion = /(考研)?数学\s*(二|2)|考研数\s*(二|2)|数二/.test(message);
  const asksSyllabus =
    message.includes("考哪些") ||
    message.includes("考什么") ||
    message.includes("哪些科目") ||
    message.includes("具体章节") ||
    message.includes("章节") ||
    message.includes("大纲") ||
    message.includes("范围");

  return isMathTwoQuestion && asksSyllabus;
};

export { isMathTwoSyllabusQuestion };

export const parseKnowledgeAnswerIntent = (message: string): AgentIntent | null => {
  if (!isMathTwoSyllabusQuestion(message)) {
    return null;
  }

  return {
    args: {
      answer: mathTwoSyllabusAnswer,
      suggestAction: "如果你愿意，我可以把这些章节拆成「考研数学二复习清单」。",
    },
    confidence: 0.92,
    intent: "answer_question",
  };
};
