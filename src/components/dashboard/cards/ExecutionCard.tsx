export type ExecutionCardProps = {
  title: string;
  steps: Array<{ label: string; status: "completed" | "in_progress" | "pending" | "failed" }>;
  isRunning?: boolean;
};

export function ExecutionCard({ title, steps, isRunning }: ExecutionCardProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-surface-strong p-4 space-y-3">
      <div className="flex items-center gap-2">
        {isRunning ? (
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        ) : null}
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span className={
              step.status === "completed" ? "text-green-500" :
              step.status === "failed" ? "text-red-500" :
              step.status === "in_progress" ? "text-blue-500" :
              "text-muted"
            }>
              {step.status === "completed" ? "✓" :
               step.status === "failed" ? "✗" :
               step.status === "in_progress" ? "●" : "○"}
            </span>
            <span className={step.status === "in_progress" ? "font-medium text-foreground" : "text-muted"}>
              {step.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
