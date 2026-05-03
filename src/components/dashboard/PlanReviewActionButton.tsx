"use client";

import { useState } from "react";

export function PlanReviewActionButton({
  recommendationIndex,
  reviewId,
}: {
  recommendationIndex: number;
  reviewId: number;
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "succeeded">("idle");
  const [errorMessage, setErrorMessage] = useState<null | string>(null);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={status !== "idle"}
        onClick={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          setStatus("submitting");
          setErrorMessage(null);

          try {
            const response = await fetch("/api/agent/recommendation/apply", {
              body: JSON.stringify({
                recommendationIndex,
                reviewId,
              }),
              headers: {
                "Content-Type": "application/json",
              },
              method: "POST",
            });
            const data = (await response.json()) as {
              assistantMessage?: string;
            };

            if (!response.ok) {
              throw new Error(data.assistantMessage ?? "建议应用失败。");
            }

            setStatus("succeeded");
          } catch (error) {
            setStatus("idle");
            setErrorMessage(error instanceof Error ? error.message : "建议应用失败。");
          }
        }}
        className="rounded-md border border-border bg-white/60 px-2.5 py-1 text-xs font-semibold text-foreground transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "submitting" ? "正在创建..." : status === "succeeded" ? "已创建跟进计划" : "创建跟进计划"}
      </button>
      {errorMessage ? <span className="text-xs text-rose-700">{errorMessage}</span> : null}
    </div>
  );
}
