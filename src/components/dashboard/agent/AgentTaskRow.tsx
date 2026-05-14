type AgentTaskRowProps = {
  detail?: null | string;
  disabled?: boolean;
  label: string;
  meta?: null | string;
  onClick?: () => void;
  selected?: boolean;
  tone?: "accent" | "danger" | "info" | "muted" | "success" | "warning";
};

export function AgentTaskRow({
  detail,
  disabled,
  label,
  meta,
  onClick,
  selected,
  tone = "muted",
}: AgentTaskRowProps) {
  const className = `sunny-agent-task-row sunny-agent-task-row-${tone} ${selected ? "sunny-agent-task-row-selected" : ""}`;

  if (!onClick) {
    return (
      <div className={className} role="listitem">
        <span className="sunny-agent-task-row-dot" aria-hidden="true" />
        <span className="sunny-agent-task-row-copy">
          <strong>{label}</strong>
          {detail ? <small>{detail}</small> : null}
        </span>
        {meta ? <span className="sunny-agent-task-row-meta">{meta}</span> : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      role="listitem"
      className={className}
    >
      <span className="sunny-agent-task-row-dot" aria-hidden="true" />
      <span className="sunny-agent-task-row-copy">
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {meta ? <span className="sunny-agent-task-row-meta">{meta}</span> : null}
    </button>
  );
}
