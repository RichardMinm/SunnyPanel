import { buildMessages, type ChatMessage } from "../llm/message-builder";
import { QUALITATIVE_QUERY_SYSTEM_RULES, serializeQualitativeProjection, type QualitativeQueryProjection } from "./qualitative-projection";

export const buildQueryMessages = ({ projection }: { projection: QualitativeQueryProjection }): ChatMessage[] =>
  buildMessages({
    systemRules: QUALITATIVE_QUERY_SYSTEM_RULES,
    userMessage: serializeQualitativeProjection(projection),
  });
