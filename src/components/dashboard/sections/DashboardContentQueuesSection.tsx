import type { DashboardPageViewModel } from "@/components/dashboard/dashboard-view-model";
import { DashboardContentQueueCard } from "@/components/dashboard/DashboardContentQueueCard";
import { SectionHeader } from "@/components/ui/SunnyComponents";

type DashboardContentQueuesSectionProps = {
  model: DashboardPageViewModel;
};

export function DashboardContentQueuesSection({ model }: DashboardContentQueuesSectionProps) {
  const { contentQueues, locale } = model;

  return (
    <section className="sunny-dashboard-card sunny-dashboard-card-quiet sunny-content-operations">
      <SectionHeader
        kicker="内容工作台"
        title="内容运营"
        description="草稿、私有待发和公开内容用轻量行处理；这里更像编辑台，不再是一排同权重卡片。"
        action={
          <span className="sunny-dashboard-count">
            {contentQueues.reduce((total, queue) => total + queue.items.length, 0)} 条
          </span>
        }
      />

      <div className="sunny-content-operations-grid mt-5">
        {contentQueues.map((queue) => (
          <DashboardContentQueueCard key={queue.title} locale={locale} {...queue} />
        ))}
      </div>
    </section>
  );
}
