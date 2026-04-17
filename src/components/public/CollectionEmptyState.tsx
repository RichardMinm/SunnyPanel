type CollectionEmptyStateProps = {
  body: string;
  title: string;
};

export function CollectionEmptyState({ body, title }: CollectionEmptyStateProps) {
  return (
    <div className="sunny-card rounded-[2rem] p-8 text-muted">
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      <p className="mt-3 max-w-2xl leading-8">{body}</p>
    </div>
  );
}
