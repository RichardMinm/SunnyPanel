import type { DashboardPageViewModel } from "@/components/dashboard/dashboard-view-model";
import { DashboardContentQueueCard } from "@/components/dashboard/DashboardContentQueueCard";
import { SectionHeader } from "@/components/ui/SunnyComponents";

type DashboardContentQueuesSectionProps = {
  compact?: boolean;
  embedded?: boolean;
  model: DashboardPageViewModel;
};

export function DashboardContentQueuesSection({ compact, embedded, model }: DashboardContentQueuesSectionProps) {
  const { contentQueues, locale } = model;
  const queues = compact ? contentQueues.slice(0, 2) : contentQueues;

  const content = (
    <>
      {!embedded ? (
        <SectionHeader
          kicker="内容"
          title="最近编辑与草稿"
          description={compact ? "两条队列即可扫一眼状态。" : "草稿、私有待发和公开内容用轻量行处理；这里更像编辑台，不再是一排同权重卡片。"}
          action={
            <span className="sunny-dashboard-count">
              {queues.reduce((total, queue) => total + queue.items.length, 0)} 条
            </span>
          }
        />
      ) : null}

      <div className={`sunny-content-operations-grid${embedded ? " mt-0" : " mt-5"}`}>
        {queues.map((queue) => (
          <DashboardContentQueueCard key={queue.title} locale={locale} {...queue} />
        ))}
      </div>
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <section className="sunny-dashboard-card sunny-dashboard-card-quiet sunny-content-operations">
      {content}
    </section>
  );
}
