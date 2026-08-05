import type { ScheduleQuerySummaryData } from "./utils";

type ScheduleQueryCardProps = {
  summary: ScheduleQuerySummaryData;
};

const formatDateLabel = (date: string): string => {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) {
    return date;
  }

  const [, year, month, day] = match;
  const value = new Date(Number(year), Number(month) - 1, Number(day));
  const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(value);

  return `${Number(month)} 月 ${Number(day)} 日 · ${weekday}`;
};

export function ScheduleQueryCard({ summary }: ScheduleQueryCardProps) {
  return (
    <article className="sunny-schedule-query-card" aria-label={`${summary.rangeLabel}日程`}>
      <header className="sunny-schedule-query-card-header">
        <div>
          <p>日程</p>
          <h3>{summary.rangeLabel}</h3>
        </div>
        <span>{summary.totalCount} 项</span>
      </header>

      <div className="sunny-schedule-query-days">
        {summary.groups.map((group) => (
          <section className="sunny-schedule-query-day" key={group.date}>
            <time dateTime={group.date}>{formatDateLabel(group.date)}</time>
            <div className="sunny-schedule-query-items">
              {group.items.map((item, index) => (
                <div className="sunny-schedule-query-item" key={`${group.date}-${item.timeRange}-${item.title}-${index}`}>
                  <strong>{item.timeRange}</strong>
                  <div>
                    <h4>{item.title}</h4>
                    {item.meta.length > 0 ? (
                      <p>
                        {item.meta.map((label) => (
                          <span key={label}>{label}</span>
                        ))}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {summary.hiddenCount > 0 ? (
        <p className="sunny-schedule-query-card-more">还有 {summary.hiddenCount} 项未展开</p>
      ) : null}
    </article>
  );
}
