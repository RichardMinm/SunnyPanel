import Link from "next/link";

import type { DashboardPageViewModel } from "@/components/dashboard/dashboard-view-model";
import { DashboardScheduleDayPanel } from "@/components/dashboard/DashboardScheduleDayPanel";
import { SectionHeader } from "@/components/ui/SunnyComponents";

type DashboardScheduleBlockProps = {
  model: DashboardPageViewModel;
};

export function DashboardScheduleBlock({ model }: DashboardScheduleBlockProps) {
  const { snapshot } = model;

  return (
    <section className="sunny-dashboard-card sunny-dashboard-card-quiet sunny-schedule-section">
      <SectionHeader
        kicker="日程安排"
        title="今天与明天"
        description="Agent 创建的日程会先落在这里，方便把计划变成当天可执行的时间块。"
        action={
          <Link className="sunny-dashboard-link" href="/admin/collections/schedule-items">
            打开日程
          </Link>
        }
      />
      <div className="sunny-schedule-grid mt-5">
        <DashboardScheduleDayPanel
          empty="今天还没有日程。可以让 Agent 说“帮我安排今天”。"
          items={snapshot.schedule.today}
          kicker="今日日程"
          title="今日日程"
        />
        <DashboardScheduleDayPanel
          empty="明天还没有安排。可以说“把这个计划放到明天上午”。"
          items={snapshot.schedule.tomorrow}
          kicker="明日预览"
          title="明日预览"
        />
      </div>
    </section>
  );
}
