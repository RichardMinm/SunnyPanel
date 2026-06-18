import type { AgentIntent } from "../../schemas";
import { cleanupText } from "./shared-text";

/* ── delete_record ────────────────────────────── */

const DELETE_KEYWORDS = ["删除", "删掉", "删了", "移除", "去掉"];

const extractQuotedName = (message: string): string | null => {
  const m = message.match(/[「「]([^」」]+)[」」]/);
  return m ? cleanupText(m[1]) : null;
};

const extractDeleteTarget = (message: string): { entityName: string; entityType: "checklist" | "plan" | "schedule" | "timeline" } | null => {
  const quoted = extractQuotedName(message);
  if (quoted) {
    if (/时间线|记录|事件/.test(message)) return { entityName: quoted, entityType: "timeline" };
    if (/清单/.test(message)) return { entityName: quoted, entityType: "checklist" };
    if (/日程|会议|安排/.test(message)) return { entityName: quoted, entityType: "schedule" };
    return { entityName: quoted, entityType: "plan" };
  }

  // No quoted name → extract from pattern "删除 + entity"
  const hasDelete = DELETE_KEYWORDS.some((kw) => message.includes(kw));
  if (!hasDelete) return null;

  // Try to extract entity type from message
  if (/时间线|记录/.test(message)) return { entityName: cleanupText(message), entityType: "timeline" };
  if (/清单/.test(message)) return { entityName: cleanupText(message), entityType: "checklist" };
  if (/日程|会议|安排/.test(message)) return { entityName: cleanupText(message), entityType: "schedule" };
  if (/计划/.test(message)) return { entityName: cleanupText(message), entityType: "plan" };

  return null;
};

export const parseDeleteRecordIntent = (message: string): AgentIntent | null => {
  const hasDelete = DELETE_KEYWORDS.some((kw) => message.includes(kw));
  if (!hasDelete) return null;

  const target = extractDeleteTarget(message);
  if (!target || !target.entityName || target.entityName.length < 2) return null;

  return {
    args: {
      entityName: target.entityName,
      entityType: target.entityType,
    },
    confidence: 0.78,
    intent: "delete_record",
  };
};

/* ── modify_record ────────────────────────────── */

const UPDATE_PATTERNS = [
  /把.{1,20}的(.{1,10})改成(.{1,30})/,
  /把.{1,20}的(.{1,10})改到(.{1,30})/,
  /把.{1,20}的(.{1,10})改为(.{1,30})/,
  /把.{1,20}的(.{1,10})调整为(.{1,30})/,
  /把.{1,20}的(.{1,10})更新为(.{1,30})/,
  /把.{1,20}的(.{1,10})提升到(.{1,30})/,
  /把.{1,20}的(.{1,10})推迟到(.{1,30})/,
  /把.{1,20}的(.{1,10})提前到(.{1,30})/,
  /把.{1,20}改成(.{1,30})/,
  /把.{1,20}改到(.{1,30})/,
  /把.{1,20}改为(.{1,30})/,
  /把.{1,20}标记为(.{1,30})/,
];

const extractUpdateTarget = (message: string): { changeDescription: string; entityName: string; entityType: "checklist" | "plan" | "schedule" | "timeline" } | null => {
  // Try quoted name first
  const quoted = extractQuotedName(message);
  let entityName = "";

  if (quoted) {
    entityName = quoted;
  } else {
    // Extract entity name from "把X的Y改成Z" pattern
    const match = message.match(/把(.{1,20})的/);
    if (match?.[1]) {
      entityName = cleanupText(match[1]);
    } else {
      // Try "把X改成Y" pattern
      const m2 = message.match(/把(.{1,20})[改调整更提推迟标]/);
      if (m2?.[1]) entityName = cleanupText(m2[1]);
    }
  }

  if (!entityName || entityName.length < 2) return null;

  // Determine type
  let entityType: "checklist" | "plan" | "schedule" | "timeline" = "plan";
  if (/日程|会议|安排|时间|几点|改到|改到/.test(message)) entityType = "schedule";
  if (/清单|条目|完成/.test(message)) entityType = "checklist";
  if (/时间线|记录/.test(message)) entityType = "timeline";

  return {
    changeDescription: cleanupText(message),
    entityName,
    entityType,
  };
};

export const parseModifyRecordIntent = (message: string): AgentIntent | null => {
  // Check for update pattern
  const hasUpdatePattern = UPDATE_PATTERNS.some((p) => p.test(message));
  if (!hasUpdatePattern) return null;

  // Also check for standalone update keywords
  const hasUpdateKeyword = /(改成|改到|改为|调整为|推迟到|提前到|更新为|标记为|提升到)/.test(message);
  if (!hasUpdateKeyword) return null;

  const target = extractUpdateTarget(message);
  if (!target || !target.entityName || target.entityName.length < 2) return null;

  return {
    args: {
      changeDescription: target.changeDescription,
      entityName: target.entityName,
      entityType: target.entityType,
    },
    confidence: 0.72,
    intent: "modify_record",
  };
};
