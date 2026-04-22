import type { ReactNode } from "react";

import { MotionReveal } from "@/components/public/MotionReveal";

type SectionIntroStat = {
  label: string;
  value: string | number;
};

type SectionIntroProps = {
  actions?: ReactNode;
  description?: string;
  eyebrow: string;
  stats?: SectionIntroStat[];
  title: string;
};

export function SectionIntro({ actions, description, eyebrow, stats, title }: SectionIntroProps) {
  return (
    <MotionReveal>
      <header className="sunny-panel rounded-[1.45rem] px-4 py-4 md:rounded-[1.7rem] md:px-6 md:py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="sunny-kicker text-[0.68rem] text-muted">{eyebrow}</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground md:text-[2rem]">
              {title}
            </h1>
            {description ? (
              <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">{description}</p>
            ) : null}
          </div>

          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>

        {stats && stats.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2.5">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-full border border-border bg-white/68 px-3.5 py-2 text-sm"
              >
                <span className="text-muted">{stat.label}</span>
                <span className="ml-2 font-semibold text-foreground">{stat.value}</span>
              </div>
            ))}
          </div>
        ) : null}
      </header>
    </MotionReveal>
  );
}
