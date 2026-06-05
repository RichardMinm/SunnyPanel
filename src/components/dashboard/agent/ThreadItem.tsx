import type { AgentThreadSummary } from "./types";
import { getPendingActionLabel } from "./utils";
import { TaskItem } from "./TaskItem";

export function ThreadItem({
  onArchive,
  onLoad,
  selected,
  thread,
}: {
  onArchive?: (threadId: number, archived: boolean) => void;
  onLoad: (threadId: number) => void;
  selected?: boolean;
  thread: AgentThreadSummary;
}) {
  return (
    <div className="sunny-thread-item">
      <TaskItem
        badge={thread.archived ? "归档" : thread.tags?.length ? thread.tags[0] : `#${thread.id}`}
        detail={thread.pendingAction ? getPendingActionLabel(thread.pendingAction) : thread.title}
        label={thread.title || `会话 #${thread.id}`}
        onClick={() => onLoad(thread.id)}
        selected={selected}
        tone={thread.archived ? "muted" : thread.pendingAction ? "warning" : "muted"}
      />
      {onArchive ? (
        <button
          type="button"
          className="sunny-thread-item-archive"
          title={thread.archived ? "取消归档" : "归档"}
          onClick={() => onArchive(thread.id, !thread.archived)}
        >
          {thread.archived ? "恢复" : "归档"}
        </button>
      ) : null}
    </div>
  );
}
