import { RiskBadge } from "./RiskBadge";

type TaskItemTone = "accent" | "danger" | "info" | "muted" | "success" | "warning";

export type TaskItemProps = {
  actionLabel?: string;
  badge?: null | string;
  detail?: null | string;
  disabled?: boolean;
  label: string;
  onAction?: () => void;
  onClick?: () => void;
  selected?: boolean;
  tone?: TaskItemTone;
};

export function TaskItem({
  actionLabel,
  badge,
  detail,
  disabled,
  label,
  onAction,
  onClick,
  selected,
  tone = "muted",
}: TaskItemProps) {
  const content = (
    <>
      <span className="sunny-task-item-dot" aria-hidden="true" />
      <span className="sunny-task-item-copy">
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {badge ? <RiskBadge>{badge}</RiskBadge> : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          className="sunny-task-item-action"
          onClick={(event) => {
            event.stopPropagation();
            onAction();
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </>
  );
  const className = `sunny-task-item sunny-task-item-${tone}${selected ? " is-selected" : ""}`;

  if (!onClick) {
    return (
      <div className={className} role="listitem">
        {content}
      </div>
    );
  }

  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick} role="listitem">
      {content}
    </button>
  );
}
