import { createClarifyIntent, type AgentIntent } from "../../schemas";
import { completionKeywords, noteKeywords } from "./keywords";
import { cleanupText, parseChecklistMention } from "./shared-text";

export const parseCompleteItemIntent = (message: string): AgentIntent | null => {
  const keyword = completionKeywords.find((item) => message.includes(item));

  if (!keyword) {
    return null;
  }

  const source = message.includes("标记") && message.includes("完成")
    ? message
        .replace(/^.*?标记/, "")
        .replace(/(?:为)?完成.*$/, "")
    : message.slice(message.indexOf(keyword) + keyword.length);
  const parsedTarget = parseChecklistMention(source);

  if (!parsedTarget) {
    return createClarifyIntent(`我能帮你标记清单条目完成，但还需要知道是哪个清单、哪个条目。你可以说\u201c我完成了高等数学的有理积分章节\u201d。`, [
      "checklistTitle",
      "itemTitle",
    ]);
  }

  return {
    args: {
      checklistTitle: parsedTarget.checklistTitle,
      groupTitle: parsedTarget.groupTitle,
      itemTitle: parsedTarget.itemTitle,
    },
    confidence: 0.55,
    intent: "complete_plan_item",
  };
};

export const parseExplicitNoteIntent = (message: string): AgentIntent | null => {
  const keyword = noteKeywords.find((item) => message.includes(item));

  if (!keyword) {
    return null;
  }

  const [before, after] = message.split(keyword, 2);
  const completionNote = cleanupText(after ?? "");

  if (!completionNote) {
    return createClarifyIntent("你想补的完成备注是什么？可以直接说一句感受、难点或总结。", ["completionNote"]);
  }

  const parsedTarget = parseChecklistMention(
    before
      .replace(/^(给|把|为)/, "")
      .replace(/补充$/, "")
      .replace(/备注$/, ""),
  );

  if (!parsedTarget) {
    return createClarifyIntent(`这条备注要补到哪份清单的哪个条目上？你可以说\u201c给高等数学的有理积分章节补充备注：\u2026\u2026\u201d。`, [
      "checklistTitle",
      "itemTitle",
    ]);
  }

  return {
    args: {
      checklistTitle: parsedTarget.checklistTitle,
      completionNote,
      groupTitle: parsedTarget.groupTitle,
      itemTitle: parsedTarget.itemTitle,
    },
    confidence: 0.55,
    intent: "add_completion_note",
  };
};
