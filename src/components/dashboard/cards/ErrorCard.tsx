"use client";

export type ErrorCardProps = {
  reason: string;
  suggestion?: string;
  onAcceptSuggestion?: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
};

export function ErrorCard({ reason, suggestion, onAcceptSuggestion, onRetry, onCancel }: ErrorCardProps) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 space-y-3 dark:border-red-800 dark:bg-red-950/30">
      <h4 className="text-sm font-semibold text-red-700 dark:text-red-400">执行失败</h4>
      <p className="text-sm text-foreground">
        <span className="text-muted">原因：</span>{reason}
      </p>
      {suggestion ? (
        <p className="text-sm text-foreground">
          <span className="text-muted">建议：</span>{suggestion}
        </p>
      ) : null}
      <div className="flex gap-2">
        {onAcceptSuggestion ? (
          <button
            type="button"
            onClick={onAcceptSuggestion}
            className="rounded-md bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-strong"
          >
            采用建议
          </button>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-border px-4 py-1.5 text-sm font-semibold text-foreground hover:bg-surface"
          >
            重新尝试
          </button>
        ) : null}
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-1.5 text-sm font-semibold text-muted hover:bg-surface"
          >
            取消
          </button>
        ) : null}
      </div>
    </div>
  );
}
