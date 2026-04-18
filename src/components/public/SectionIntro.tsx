import type { ReactNode } from "react";

type SectionIntroStat = {
  label: string;
  value: string | number;
};

type SectionIntroProps = {
  actions?: ReactNode;
  description: string;
  eyebrow: string;
  stats?: SectionIntroStat[];
  title: string;
};

export function SectionIntro({ actions, description, eyebrow, stats, title }: SectionIntroProps) {
  return (
    <header className="sunny-card sunny-card-strong rounded-[2.2rem] p-8 md:p-10">
      <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="sunny-kicker text-xs text-muted">{eyebrow}</p>
          <h1 className="sunny-display mt-4 text-4xl leading-none text-foreground md:text-6xl">
            {title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-muted md:text-lg">{description}</p>
        </div>

        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>

      {stats && stats.length > 0 ? (
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-[1.45rem] border border-border bg-white/55 px-5 py-4"
            >
              <p className="sunny-kicker text-[0.7rem] text-muted">{stat.label}</p>
              <p className="mt-3 text-2xl font-semibold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </header>
  );
}
