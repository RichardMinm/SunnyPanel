"use client";

import { useCallback, useState } from "react";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { WorkbenchData } from "@/lib/dashboard/load-workbench-data";
import type { DashboardIconMode } from "../DashboardIconBar";
import type { ScheduleItemRecord } from "@/lib/schedule/items";
import type { TimelineEvent } from "@/payload-types";
import { DashboardIcon, type DashboardIconName } from "../icons";

/* ─── helpers ─── */

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return hours === 1 ? "今天" : `${hours}小时前`;
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;
  return new Date(iso).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

const SCHEDULE_CATEGORY_LABEL: Record<string, string> = {
  course: "课程",
  study: "学习",
  plan_action: "计划",
  agent: "Agent",
  exam: "考试",
  default: "其他",
};

const TIMELINE_TYPE_LABEL: Record<string, string> = {
  milestone: "里程碑",
  project: "项目",
  life: "生活",
  study: "学习",
  exam: "考试",
  agent: "Agent",
};

const TIMELINE_TYPE_ICON: Record<string, DashboardIconName> = {
  milestone: "timeline",
  project: "checklist",
  life: "calendar",
  study: "thinking",
  exam: "review",
  agent: "agent",
};

/* ─── action chips ─── */

const ACTION_CHIPS = [
  { label: "安排今天", prompt: "帮我安排今天的日程" },
  { label: "查看最近日程", prompt: "帮我查看最近的日程安排" },
  { label: "总结学习进度", prompt: "总结一下当前的学习进度" },
  { label: "创建清单", prompt: "帮我创建一个待办清单" },
];

/* ─── props ─── */

type DashboardWorkbenchHomeProps = {
  suggestions: AgentInboxSuggestion[];
  workbenchData: WorkbenchData;
  onModeChange: (mode: DashboardIconMode, prompt: string) => void;
  onAcceptSuggestion: (id: number) => Promise<void>;
  onDismissSuggestion: (id: number) => Promise<void>;
};

/* ─── sub-components ─── */

function WelcomeHeader({
  userName,
  scheduleCount,
  planCount,
  onAction,
}: {
  userName: string;
  scheduleCount: number;
  planCount: number;
  onAction: (prompt: string) => void;
}) {
  return (
    <header className="sunny-workbench-welcome">
      <div className="sunny-workbench-welcome-text">
        <h1>你好，{userName}</h1>
        <p>
          今天有{" "}
          <strong>{scheduleCount}</strong> 个日程
          {planCount > 0 ? (
            <>，<strong>{planCount}</strong> 个计划即将到期</>
          ) : null}
        </p>
      </div>
      <div className="sunny-workbench-welcome-actions">
        {ACTION_CHIPS.map((chip) => (
          <button
            key={chip.label}
            type="button"
            className="sunny-workbench-chip"
            onClick={() => onAction(chip.prompt)}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </header>
  );
}

function TodayActionsCard({
  items,
  onAction,
}: {
  items: ScheduleItemRecord[];
  onAction: (prompt: string) => void;
}) {
  return (
    <section className="sunny-workbench-card">
      <div className="sunny-workbench-card-head">
        <h2>今日行动</h2>
        <button
          type="button"
          className="sunny-workbench-card-link"
          onClick={() => onAction("帮我查看最近的日程安排")}
        >
          查看日程 →
        </button>
      </div>
      {items.length === 0 ? (
        <div className="sunny-workbench-card-empty">
          <p>今天还没有安排</p>
          <span>让 Sunny 帮你生成今日计划</span>
          <button
            type="button"
            className="sunny-workbench-chip is-primary"
            onClick={() => onAction("帮我安排今天的日程")}
          >
            安排今天
          </button>
        </div>
      ) : (
        <ul className="sunny-workbench-schedule-list">
          {items.slice(0, 5).map((item) => (
            <li key={item.id} className="sunny-workbench-schedule-item">
              <span className="sunny-workbench-schedule-time">
                {item.isAllDay ? "全天" : formatTime(item.startTime) || "--:--"}
              </span>
              <span className="sunny-workbench-schedule-title">{item.title}</span>
              <span className="sunny-workbench-schedule-badge">
                {SCHEDULE_CATEGORY_LABEL[item.category ?? "default"] ?? "其他"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlansOverviewCard({
  counts,
  onAction,
}: {
  counts: WorkbenchData["planCounts"];
  onAction: (prompt: string) => void;
}) {
  return (
    <section className="sunny-workbench-card">
      <div className="sunny-workbench-card-head">
        <h2>计划概览</h2>
        <span className="sunny-workbench-card-subtitle">{counts.total} 个计划</span>
      </div>
      <div className="sunny-workbench-stat-grid">
        <div className="sunny-workbench-stat">
          <strong>{counts.active}</strong>
          <span>进行中</span>
        </div>
        <div className="sunny-workbench-stat">
          <strong>{counts.backlog}</strong>
          <span>待开始</span>
        </div>
        <div className="sunny-workbench-stat">
          <strong className={counts.overdue > 0 ? "is-warning" : ""}>{counts.overdue}</strong>
          <span>即将到期</span>
        </div>
        <div className="sunny-workbench-stat">
          <strong>{counts.done}</strong>
          <span>已完成</span>
        </div>
      </div>
      <div className="sunny-workbench-card-actions">
        <button
          type="button"
          className="sunny-workbench-card-link"
          onClick={() => onAction("帮我查看和整理最近的计划")}
        >
          整理计划
        </button>
      </div>
    </section>
  );
}

function ChecklistProgressCard({
  stats,
  onAction,
}: {
  stats: WorkbenchData["checklistStats"];
  onAction: (prompt: string) => void;
}) {
  const rate = stats.weekTotal > 0 ? Math.round((stats.weekCompleted / stats.weekTotal) * 100) : 0;

  return (
    <section className="sunny-workbench-card">
      <div className="sunny-workbench-card-head">
        <h2>清单进度</h2>
        <button
          type="button"
          className="sunny-workbench-card-link"
          onClick={() => onAction("帮我查看当前的清单")}
        >
          查看清单 →
        </button>
      </div>
      <div className="sunny-workbench-stat-grid">
        <div className="sunny-workbench-stat">
          <strong>{stats.todayCompleted}</strong>
          <span>今日完成</span>
        </div>
        <div className="sunny-workbench-stat">
          <strong>{rate}%</strong>
          <span>本周完成率</span>
        </div>
        <div className="sunny-workbench-stat">
          <strong>{stats.remainingTotal}</strong>
          <span>剩余任务</span>
        </div>
      </div>
      <div className="sunny-workbench-progress-bar">
        <span
          className="sunny-workbench-progress-fill"
          style={{ width: `${rate}%` }}
        />
      </div>
    </section>
  );
}

function SunnySuggestionsCard({
  suggestions,
  onAccept,
  onDismiss,
  onAction,
}: {
  suggestions: AgentInboxSuggestion[];
  onAccept: (id: number) => Promise<void>;
  onDismiss: (id: number) => Promise<void>;
  onAction: (prompt: string) => void;
}) {
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const handleAccept = useCallback(
    async (id: number, prompt?: string) => {
      setBusyIds((prev) => new Set(prev).add(id));
      await onAccept(id);
      if (prompt) onAction(prompt);
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [onAccept, onAction],
  );

  const handleDismiss = useCallback(
    async (id: number) => {
      setBusyIds((prev) => new Set(prev).add(id));
      await onDismiss(id);
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [onDismiss],
  );

  return (
    <section className="sunny-workbench-card sunny-workbench-suggestions">
      <div className="sunny-workbench-card-head">
        <h2>💡 Sunny 建议</h2>
        <span className="sunny-workbench-card-subtitle">
          {suggestions.length > 0 ? `${suggestions.length} 条建议` : "暂无建议"}
        </span>
      </div>
      {suggestions.length === 0 ? (
        <div className="sunny-workbench-card-empty">
          <p>暂时没有新的建议</p>
          <span>完成更多任务后 Sunny 会给出建议</span>
        </div>
      ) : (
        <ul className="sunny-workbench-suggestion-list">
          {suggestions.slice(0, 3).map((s) => (
            <li key={s.id} className="sunny-workbench-suggestion-item">
              <div className="sunny-workbench-suggestion-body">
                <strong>{s.title}</strong>
                {s.reason ? <small>{s.reason}</small> : null}
              </div>
              <div className="sunny-workbench-suggestion-actions">
                <button
                  type="button"
                  className="sunny-workbench-suggestion-accept"
                  disabled={busyIds.has(s.id)}
                  onClick={() => handleAccept(s.id, s.suggestedPrompt ?? undefined)}
                >
                  采纳
                </button>
                <button
                  type="button"
                  className="sunny-workbench-suggestion-dismiss"
                  disabled={busyIds.has(s.id)}
                  onClick={() => handleDismiss(s.id)}
                >
                  忽略
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecentActivityCard({
  events,
  onAction,
}: {
  events: TimelineEvent[];
  onAction: (prompt: string) => void;
}) {
  return (
    <section className="sunny-workbench-card">
      <div className="sunny-workbench-card-head">
        <h2>最近动态</h2>
        <button
          type="button"
          className="sunny-workbench-card-link"
          onClick={() => onAction("帮我查看最近的时间线")}
        >
          查看时间线 →
        </button>
      </div>
      {events.length === 0 ? (
        <div className="sunny-workbench-card-empty">
          <p>暂无最近动态</p>
        </div>
      ) : (
        <ul className="sunny-workbench-timeline-list">
          {events.map((event) => (
            <li key={event.id} className="sunny-workbench-timeline-item">
              <span className="sunny-workbench-timeline-icon" aria-hidden>
                <DashboardIcon name={TIMELINE_TYPE_ICON[event.type ?? "milestone"] ?? "timeline"} />
              </span>
              <span className="sunny-workbench-timeline-body">
                <span>{event.title}</span>
                <small>
                  {TIMELINE_TYPE_LABEL[event.type ?? "milestone"] ?? event.type}
                  {" · "}
                  {formatRelativeTime(event.eventDate)}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ─── compact composer ─── */

function WorkbenchComposer({ onSend }: { onSend: (prompt: string) => void }) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (!trimmed) return;
      onSend(trimmed);
      setValue("");
    },
    [value, onSend],
  );

  return (
    <form className="sunny-workbench-composer" onSubmit={handleSubmit}>
      <input
        type="text"
        className="sunny-workbench-composer-input"
        placeholder="问问 Sunny：帮我安排今天、总结进度、创建清单…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        type="submit"
        className="sunny-workbench-composer-send"
        disabled={!value.trim()}
        aria-label="发送"
      >
        ↑
      </button>
    </form>
  );
}

/* ─── main ─── */

export function DashboardWorkbenchHome({
  suggestions,
  workbenchData,
  onModeChange,
  onAcceptSuggestion,
  onDismissSuggestion,
}: DashboardWorkbenchHomeProps) {
  const handleAction = useCallback(
    (prompt: string) => {
      onModeChange("agent", prompt);
    },
    [onModeChange],
  );

  return (
    <div className="sunny-workbench-home">
      <WelcomeHeader
        userName={workbenchData.userName}
        scheduleCount={workbenchData.todaySchedule.length}
        planCount={workbenchData.planCounts.overdue}
        onAction={handleAction}
      />

      <div className="sunny-workbench-grid">
        {/* left column */}
        <div className="sunny-workbench-col-left">
          <TodayActionsCard
            items={workbenchData.todaySchedule}
            onAction={handleAction}
          />
          <PlansOverviewCard
            counts={workbenchData.planCounts}
            onAction={handleAction}
          />
          <ChecklistProgressCard
            stats={workbenchData.checklistStats}
            onAction={handleAction}
          />
        </div>

        {/* right column */}
        <div className="sunny-workbench-col-right">
          <SunnySuggestionsCard
            suggestions={suggestions}
            onAccept={onAcceptSuggestion}
            onDismiss={onDismissSuggestion}
            onAction={handleAction}
          />
          <RecentActivityCard
            events={workbenchData.recentTimeline}
            onAction={handleAction}
          />
        </div>
      </div>

      <WorkbenchComposer onSend={handleAction} />
    </div>
  );
}
