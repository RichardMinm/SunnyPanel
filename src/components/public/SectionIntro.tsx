type SectionIntroProps = {
  description: string;
  eyebrow: string;
  title: string;
};

export function SectionIntro({ description, eyebrow, title }: SectionIntroProps) {
  return (
    <header className="sunny-card sunny-card-strong rounded-[2rem] p-8 md:p-10">
      <p className="sunny-kicker text-xs text-muted">{eyebrow}</p>
      <h1 className="sunny-display mt-4 text-4xl leading-none text-foreground md:text-6xl">
        {title}
      </h1>
      <p className="mt-5 max-w-3xl text-base leading-8 text-muted md:text-lg">{description}</p>
    </header>
  );
}
