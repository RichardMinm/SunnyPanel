"use client";

import { useCallback, useState } from "react";

import type { DashboardContentCollection } from "@/lib/dashboard/content/config";
import type { ContentOutlineItem, RichContentDocument } from "@/lib/rich-content/types";
import type { WritingAssistAction } from "@/lib/agent/prompts/writing-assist";

export type { WritingAssistAction };

type WritingAssistContext = {
  collection?: DashboardContentCollection;
  contentRich?: RichContentDocument;
  summary?: string;
  text?: string;
  title?: string;
};

export type WritingAssistResponse = {
  message?: string;
  outline?: ContentOutlineItem[];
  result?: string;
  tags?: string[];
};

export function useWritingAssist() {
  const [error, setError] = useState<null | string>(null);
  const [isLoading, setIsLoading] = useState(false);

  const runAssist = useCallback(async (action: WritingAssistAction, context: WritingAssistContext) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agent/writing-assist", {
        body: JSON.stringify({ action, ...context }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const body = (await response.json().catch(() => null)) as null | WritingAssistResponse;

      if (!response.ok) {
        throw new Error(body?.message ?? "AI 辅助请求失败");
      }

      return body;
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "AI 辅助请求失败";
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const rememberStyle = useCallback(
    async (
      sourceAction: WritingAssistAction,
      result: string,
      context: Pick<WritingAssistContext, "collection" | "text">,
    ) => {
      if (!result.trim()) {
        return;
      }

      try {
        await fetch("/api/agent/writing-assist", {
          body: JSON.stringify({ action: "remember_style", result, sourceAction, ...context }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
      } catch {
        // 文风沉淀是增强能力，失败时静默降级，不打断写作流程。
      }
    },
    [],
  );

  return {
    error,
    isLoading,
    rememberStyle,
    runAssist,
  };
}
