"use client";

import { useCallback, useEffect, useState } from "react";

type TimelineEventSummary = {
  id: number;
  title: string;
  date: string;
  type: string;
  relatedPlan?: { id: number; title: string } | null;
};

type TimelineViewProps = {
  onBackToWorkbench: () => void;
  threadId: number | null;
};

const EVENT_COLORS: Record<string, string> = {
  milestone: "#4ade80",
  project: "#888",
  life: "#e2b93b",
};

export function TimelineView({
  onBackToWorkbench,
}: TimelineViewProps) {
  const [events, setEvents] = useState<TimelineEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearMonth, setYearMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/agent/timeline?month=${yearMonth}&limit=50`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          events: TimelineEventSummary[];
        };
        setEvents(data.events ?? []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  return (
    <div className="sunny-dashboard-main sunny-timeline-view">
      {/* Header */}
      <div className="sunny-timeline-view-head">
        <button
          type="button"
          className="sunny-timeline-back-btn"
          onClick={onBackToWorkbench}
        >
          ← 返回工作台
        </button>
        <h2>📜 时间线</h2>
        <input
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="sunny-timeline-month-input"
          aria-label="选择月份"
        />
      </div>

      {/* Timeline */}
      <div className="sunny-timeline-track">
        {loading ? (
          <p className="sunny-agent-inspector-empty">加载时间线...</p>
        ) : events.length === 0 ? (
          <p className="sunny-agent-inspector-empty">
            本月暂无时间线事件
          </p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="sunny-timeline-event">
              <div className="sunny-timeline-event-dot">
                <span
                  style={{
                    display: "block",
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background:
                      EVENT_COLORS[event.type] ?? "#888",
                  }}
                />
                <span className="sunny-timeline-event-line" />
              </div>
              <div className="sunny-timeline-event-body">
                <small>{event.date}</small>
                <strong>{event.title}</strong>
                {event.relatedPlan ? (
                  <span className="sunny-timeline-event-plan">
                    关联 {event.relatedPlan.title}
                  </span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
