"use client";

import Link from "next/link";
import { useState } from "react";

type EvaluationResponse = {
  assistantMessage?: string;
  reviewId?: number;
};

export function EvaluatePlanButton({
  planId,
}: {
  planId: number;
}) {
  const [status, setStatus] = useState<"idle" | "submitting" | "succeeded">("idle");
  const [result, setResult] = useState<EvaluationResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={status !== "idle"}
        onClick={async (event) => {
          event.preventDefault();
          event.stopPropagation();
          setStatus("submitting");
          setErrorMessage(null);

          try {
            const response = await fetch("/api/agent/evaluate", {
              body: JSON.stringify({
                planId,
              }),
              headers: {
                "Content-Type": "application/json",
              },
              method: "POST",
            });
            const data = (await response.json()) as EvaluationResponse;

            if (!response.ok) {
              throw new Error(data.assistantMessage ?? "计划评估失败。");
            }

            setResult(data);
            setStatus("succeeded");
          } catch (error) {
            setStatus("idle");
            setErrorMessage(error instanceof Error ? error.message : "计划评估失败。");
          }
        }}
        className="sunny-button-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "submitting" ? "评估中..." : status === "succeeded" ? "已生成评估" : "评估计划"}
      </button>

      {result?.assistantMessage ? (
        <div className="border-l-2 border-border px-3 py-2 text-sm leading-6 text-muted">
          <p>{result.assistantMessage}</p>
          {typeof result.reviewId === "number" ? (
            <Link className="mt-2 inline-flex font-semibold text-accent-strong" href={`/admin/collections/plan-reviews/${result.reviewId}`}>
              打开 PlanReview #{result.reviewId}
            </Link>
          ) : null}
        </div>
      ) : null}

      {errorMessage ? <span className="text-xs text-rose-700">{errorMessage}</span> : null}
    </div>
  );
}
